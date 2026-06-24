// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// Command sdkgen keeps this repo's IntentGoalType constants in lock-step with
// the canonical Go source of truth in the PUBLISHED infrix-schema contract
// module (intent/types.go). It rewrites only the bytes between the
//
//	// SDKGEN-BEGIN(intent_goal_type)
//	...generated body...
//	// SDKGEN-END(intent_goal_type)
//
// markers in each governed SDK file; hand-written code outside the markers is
// preserved. `sdkgen -check` (run by the parity test + CI) fails if any target
// would be rewritten — that is the cross-repo guarantee that a goal added to the
// schema without regenerating the SDKs cannot ship. This is the TS/AS half of
// the generator that used to live in the monorepo (pkg/codegen); the Rust half
// lives in opendlt/infrix-crates.
package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	// Pin the infrix-schema module as a build dependency so `go list -m` can
	// resolve its on-disk source dir (the codegen parses intent/types.go from
	// it). The codegen reads the file rather than the package, but the blank
	// import keeps `go mod tidy` from dropping the require.
	_ "github.com/opendlt/infrix-schema/intent"
)

// schemaModulePath is the published contract module the goal vocabulary comes
// from. schemaGoalSourceRel is the source-of-truth file inside it.
const (
	schemaModulePath   = "github.com/opendlt/infrix-schema"
	schemaGoalSourceRel = "intent/types.go"
)

// goalConst is one canonical (PascalCase variant, wire string) pair.
type goalConst struct {
	GoIdent string // "SessionKeyDelegate" (the Goal* prefix stripped)
	Wire    string // "SESSION_KEY_DELEGATE"
}

// resolveSchemaGoalSource returns the absolute path to intent/types.go in the
// infrix-schema module the build consumes, via `go list -m`.
func resolveSchemaGoalSource() (string, error) {
	out, err := exec.Command("go", "list", "-m", "-f", "{{.Dir}}", schemaModulePath).Output()
	if err != nil {
		return "", fmt.Errorf("resolve %s module dir via `go list -m`: %w", schemaModulePath, err)
	}
	dir := strings.TrimSpace(string(out))
	if dir == "" {
		return "", fmt.Errorf("`go list -m %s` returned an empty module dir", schemaModulePath)
	}
	return filepath.Join(dir, filepath.FromSlash(schemaGoalSourceRel)), nil
}

// parseGoals parses the schema's intent/types.go and returns the canonical
// (ident -> wire) list in declaration order, asserting Goal* consts and the
// ValidGoalTypes map agree (a half-correct enum must fail, not silently emit).
func parseGoals(path string) ([]goalConst, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
	if err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}

	var goals []goalConst
	for _, decl := range file.Decls {
		gd, ok := decl.(*ast.GenDecl)
		if !ok || gd.Tok != token.CONST {
			continue
		}
		var carryType string
		for _, spec := range gd.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			if vs.Type != nil {
				if id, ok := vs.Type.(*ast.Ident); ok {
					carryType = id.Name
				}
			}
			if carryType != "IntentGoalType" || len(vs.Names) != 1 || len(vs.Values) != 1 {
				continue
			}
			lit, ok := vs.Values[0].(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				continue
			}
			wire, err := strconv.Unquote(lit.Value)
			if err != nil {
				continue
			}
			name := vs.Names[0].Name
			if !strings.HasPrefix(name, "Goal") {
				return nil, fmt.Errorf("%s: const %q lacks the Goal* prefix", path, name)
			}
			goals = append(goals, goalConst{GoIdent: strings.TrimPrefix(name, "Goal"), Wire: wire})
		}
	}
	if len(goals) == 0 {
		return nil, fmt.Errorf("%s: no IntentGoalType const declarations found", path)
	}
	if err := assertParity(goals, parseValidGoalTypes(file)); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return goals, nil
}

func parseValidGoalTypes(file *ast.File) map[string]struct{} {
	out := map[string]struct{}{}
	for _, decl := range file.Decls {
		gd, ok := decl.(*ast.GenDecl)
		if !ok || gd.Tok != token.VAR {
			continue
		}
		for _, spec := range gd.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok || len(vs.Names) != 1 || vs.Names[0].Name != "ValidGoalTypes" || len(vs.Values) != 1 {
				continue
			}
			cl, ok := vs.Values[0].(*ast.CompositeLit)
			if !ok {
				return out
			}
			for _, e := range cl.Elts {
				if kv, ok := e.(*ast.KeyValueExpr); ok {
					if id, ok := kv.Key.(*ast.Ident); ok {
						out[id.Name] = struct{}{}
					}
				}
			}
			return out
		}
	}
	return out
}

func assertParity(goals []goalConst, validKeys map[string]struct{}) error {
	declared := make(map[string]struct{}, len(goals))
	for _, g := range goals {
		declared["Goal"+g.GoIdent] = struct{}{}
	}
	var missingFromValid, missingFromDeclared []string
	for ident := range declared {
		if _, ok := validKeys[ident]; !ok {
			missingFromValid = append(missingFromValid, ident)
		}
	}
	for ident := range validKeys {
		if _, ok := declared[ident]; !ok {
			missingFromDeclared = append(missingFromDeclared, ident)
		}
	}
	if len(missingFromValid) == 0 && len(missingFromDeclared) == 0 {
		return nil
	}
	return fmt.Errorf("Go source drift between Goal* consts and ValidGoalTypes: missing-from-ValidGoalTypes=%v missing-from-Goal*=%v",
		missingFromValid, missingFromDeclared)
}

// target is one SDK file whose marker region this tool owns.
type target struct {
	Label   string
	RelPath string // relative to repo root
	Render  func(goals []goalConst, indent string) string
}

func allTargets() []target {
	return []target{
		{Label: "typescript", RelPath: filepath.Join("typescript", "src", "types", "governance.ts"), Render: renderTypeScript},
		{Label: "assemblyscript", RelPath: filepath.Join("assemblyscript", "assembly", "governance.ts"), Render: renderAssemblyScript},
	}
}

func renderTypeScript(goals []goalConst, indent string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%sexport type IntentGoalType =\n", indent)
	for i, g := range goals {
		term := ""
		if i == len(goals)-1 {
			term = ";"
		}
		fmt.Fprintf(&b, "%s  | '%s'%s\n", indent, g.Wire, term)
	}
	return b.String()
}

func renderAssemblyScript(goals []goalConst, indent string) string {
	var b strings.Builder
	for _, g := range goals {
		fmt.Fprintf(&b, "%sexport const GOAL_%s: string = %q;\n", indent, g.Wire, g.Wire)
	}
	return b.String()
}

const (
	beginMarker = "// SDKGEN-BEGIN(intent_goal_type)"
	endMarker   = "// SDKGEN-END(intent_goal_type)"
)

// generate runs every target. When check is true it writes nothing and returns
// the labels that WOULD change; otherwise it rewrites in place.
func generate(repoRoot string, check bool) ([]string, error) {
	src, err := resolveSchemaGoalSource()
	if err != nil {
		return nil, err
	}
	goals, err := parseGoals(src)
	if err != nil {
		return nil, err
	}
	var changed []string
	for _, t := range allTargets() {
		ch, err := applyTarget(repoRoot, t, goals, check)
		if err != nil {
			return changed, err
		}
		if ch {
			changed = append(changed, t.Label)
		}
	}
	return changed, nil
}

func applyTarget(repoRoot string, t target, goals []goalConst, check bool) (bool, error) {
	full := filepath.Join(repoRoot, t.RelPath)
	raw, err := os.ReadFile(full)
	if err != nil {
		return false, fmt.Errorf("%s: read: %w", t.Label, err)
	}
	srcStr := string(raw)

	bIdx := strings.Index(srcStr, beginMarker)
	if bIdx < 0 {
		return false, fmt.Errorf("%s: BEGIN marker not found in %s", t.Label, t.RelPath)
	}
	if strings.Count(srcStr, beginMarker) != 1 {
		return false, fmt.Errorf("%s: BEGIN marker appears more than once in %s", t.Label, t.RelPath)
	}
	lineStart := bIdx
	for lineStart > 0 && srcStr[lineStart-1] != '\n' {
		lineStart--
	}
	indent := srcStr[lineStart:bIdx]

	begLineEnd := strings.IndexByte(srcStr[bIdx:], '\n')
	if begLineEnd < 0 {
		return false, fmt.Errorf("%s: BEGIN marker is the last line of %s", t.Label, t.RelPath)
	}
	bodyStart := bIdx + begLineEnd + 1

	endIdx := strings.Index(srcStr[bodyStart:], endMarker)
	if endIdx < 0 {
		return false, fmt.Errorf("%s: END marker not found after BEGIN in %s", t.Label, t.RelPath)
	}
	endIdx += bodyStart
	endLineStart := endIdx
	for endLineStart > bodyStart && srcStr[endLineStart-1] != '\n' {
		endLineStart--
	}

	rendered := t.Render(goals, indent)
	if normalizeLF(srcStr[bodyStart:endLineStart]) == rendered {
		return false, nil
	}
	if check {
		return true, nil
	}
	newSrc := srcStr[:bodyStart] + rendered + srcStr[endLineStart:]
	if err := os.WriteFile(full, []byte(newSrc), 0o644); err != nil {
		return false, fmt.Errorf("%s: write: %w", t.Label, err)
	}
	return true, nil
}

// normalizeLF collapses CRLF to LF so the body compare is invariant to the
// checkout's line endings (LF in git, CRLF on a Windows autocrlf checkout).
func normalizeLF(s string) string { return strings.ReplaceAll(s, "\r\n", "\n") }

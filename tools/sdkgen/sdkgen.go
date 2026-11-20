// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// Command sdkgen keeps this repo's IntentGoalType constants in lock-step with the
// NODE's goal vocabulary. It rewrites only the bytes between the
//
//	// SDKGEN-BEGIN(intent_goal_type)
//	...generated body...
//	// SDKGEN-END(intent_goal_type)
//
// markers in each governed SDK file; hand-written code outside the markers is
// preserved.
//
// WHERE THE VOCABULARY COMES FROM. The generator reads the vendored
// goal-vocabulary.json at the repo root. That file is written by infrix-core
// (`go test ./pkg/release -run SDKGoalParity -count=1 -update-sdk-vocabulary`)
// from the code the node's admission path runs, and infrix-core's fence fails
// when it disagrees with the node. It used to be read from the infrix-schema
// version pinned in THIS module's go.mod, which was a published release and so
// lagged the node: `sdkgen -check` agreed with a stale schema while the SDK was
// eleven goals short. The pinned schema is now a floor, not the source: every
// goal it declares must be in the vendored vocabulary, so a published release
// can never add a goal this SDK silently lacks.
//
// THE PRIORITY VOCABULARY. The same document carries the intent priorities the
// node's admission validates (`priorities`, from infrix-schema
// intent.ValidIntentPriorities through infrix-core's alias). They are rendered
// between
//
//	// SDKGEN-BEGIN(intent_priority)
//	...generated body...
//	// SDKGEN-END(intent_priority)
//
// markers as INTENT_PRIORITIES with IntentPriority derived from it, in the
// TypeScript client and in the wallet's lean types, so IntentGoal.priority in
// each is typed by the node's words and never by a hand-copied string. The
// pinned schema is their floor too: every priority it declares must be in the
// vendored vocabulary.
//
// `sdkgen -check` (run by the parity test + CI) fails if any target would be
// rewritten or the floor is breached. The Rust half of the generator lives in
// opendlt/infrix-crates.
package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
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
	schemaModulePath    = "github.com/opendlt/infrix-schema"
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

// parsePriorities parses the schema's intent/types.go and returns the declared
// IntentPriority wire words (the IntentPriority-typed consts), asserting that
// they and the ValidIntentPriorities map agree, as parseGoals does for goals.
func parsePriorities(path string) ([]string, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
	if err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	var words []string
	declared := map[string]struct{}{}
	for _, decl := range file.Decls {
		gd, ok := decl.(*ast.GenDecl)
		if !ok || gd.Tok != token.CONST {
			continue
		}
		for _, spec := range gd.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok || len(vs.Names) != 1 || len(vs.Values) != 1 {
				continue
			}
			id, ok := vs.Type.(*ast.Ident)
			if !ok || id.Name != "IntentPriority" {
				continue
			}
			lit, ok := vs.Values[0].(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return nil, fmt.Errorf("%s: IntentPriority const %s is not a string literal", path, vs.Names[0].Name)
			}
			word, err := strconv.Unquote(lit.Value)
			if err != nil {
				return nil, fmt.Errorf("%s: IntentPriority const %s: %w", path, vs.Names[0].Name, err)
			}
			words = append(words, word)
			declared[vs.Names[0].Name] = struct{}{}
		}
	}
	if len(words) == 0 {
		return nil, fmt.Errorf("%s: no IntentPriority const declarations found", path)
	}
	valid := parseMapKeys(file, "ValidIntentPriorities")
	var missingFromValid, missingFromDeclared []string
	for ident := range declared {
		if _, ok := valid[ident]; !ok {
			missingFromValid = append(missingFromValid, ident)
		}
	}
	for ident := range valid {
		if _, ok := declared[ident]; !ok {
			missingFromDeclared = append(missingFromDeclared, ident)
		}
	}
	if len(missingFromValid) > 0 || len(missingFromDeclared) > 0 {
		sort.Strings(missingFromValid)
		sort.Strings(missingFromDeclared)
		return nil, fmt.Errorf("%s: Go source drift between IntentPriority consts and ValidIntentPriorities: missing-from-ValidIntentPriorities=%v missing-from-consts=%v",
			path, missingFromValid, missingFromDeclared)
	}
	return words, nil
}

func parseValidGoalTypes(file *ast.File) map[string]struct{} {
	return parseMapKeys(file, "ValidGoalTypes")
}

// parseMapKeys returns the identifier keys of the package-level map literal
// named varName.
func parseMapKeys(file *ast.File, varName string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, decl := range file.Decls {
		gd, ok := decl.(*ast.GenDecl)
		if !ok || gd.Tok != token.VAR {
			continue
		}
		for _, spec := range gd.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok || len(vs.Names) != 1 || vs.Names[0].Name != varName || len(vs.Values) != 1 {
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

// vocabulary is what the vendored goal-vocabulary.json carries: the node's goal
// set and the intent priorities its admission validates.
type vocabulary struct {
	Goals      []goalConst
	Priorities []string
}

// target is one marker region in one SDK file that this tool owns.
type target struct {
	Label   string
	RelPath string // relative to repo root
	Region  string // the marker name: SDKGEN-BEGIN(<Region>) ... SDKGEN-END(<Region>)
	Render  func(v vocabulary, indent string) string
}

const (
	goalRegion     = "intent_goal_type"
	priorityRegion = "intent_priority"
)

func allTargets() []target {
	governance := filepath.Join("typescript", "src", "types", "governance.ts")
	return []target{
		{Label: "typescript", RelPath: governance, Region: goalRegion, Render: renderTypeScript},
		{Label: "assemblyscript", RelPath: filepath.Join("assemblyscript", "assembly", "governance.ts"), Region: goalRegion, Render: renderAssemblyScript},
		{Label: "typescript priority", RelPath: governance, Region: priorityRegion, Render: renderTypeScriptPriorities},
		{Label: "wallet priority", RelPath: filepath.Join("typescript-wallet", "src", "governance-types.ts"), Region: priorityRegion, Render: renderTypeScriptPriorities},
	}
}

func renderTypeScript(v vocabulary, indent string) string {
	// One list, with the type DERIVED from it: the runtime list and the union
	// cannot disagree, and a client can validate a goal string against the same
	// source the compiler checks.
	var b strings.Builder
	fmt.Fprintf(&b, "%sexport const INTENT_GOAL_TYPES = [\n", indent)
	for _, g := range v.Goals {
		fmt.Fprintf(&b, "%s  '%s',\n", indent, g.Wire)
	}
	fmt.Fprintf(&b, "%s] as const;\n", indent)
	fmt.Fprintf(&b, "%sexport type IntentGoalType = (typeof INTENT_GOAL_TYPES)[number];\n", indent)
	return b.String()
}

func renderAssemblyScript(v vocabulary, indent string) string {
	var b strings.Builder
	for _, g := range v.Goals {
		fmt.Fprintf(&b, "%sexport const GOAL_%s: string = %q;\n", indent, g.Wire, g.Wire)
	}
	return b.String()
}

// renderTypeScriptPriorities renders the priority list with the type derived
// from it, the same shape as the goal list: the compiler and a runtime check
// read one source.
func renderTypeScriptPriorities(v vocabulary, indent string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%sexport const INTENT_PRIORITIES = [\n", indent)
	for _, p := range v.Priorities {
		fmt.Fprintf(&b, "%s  '%s',\n", indent, p)
	}
	fmt.Fprintf(&b, "%s] as const;\n", indent)
	fmt.Fprintf(&b, "%sexport type IntentPriority = (typeof INTENT_PRIORITIES)[number];\n", indent)
	return b.String()
}

func beginMarker(region string) string { return "// SDKGEN-BEGIN(" + region + ")" }
func endMarker(region string) string   { return "// SDKGEN-END(" + region + ")" }

// vocabularyRel is the vendored vocabulary file, relative to the repo root.
const vocabularyRel = "goal-vocabulary.json"

var (
	wireShape     = regexp.MustCompile(`^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`)
	priorityShape = regexp.MustCompile(`^[a-z]+$`)
)

// loadVocabulary reads the vendored goal vocabulary: the node's goal set and
// priorities as infrix-core's fence last generated them. Every word is
// validated, because it is emitted verbatim into source code.
func loadVocabulary(repoRoot string) (vocabulary, error) {
	raw, err := os.ReadFile(filepath.Join(repoRoot, vocabularyRel))
	if err != nil {
		return vocabulary{}, fmt.Errorf("read the vendored goal vocabulary: %w (generate it with `go test ./pkg/release -run SDKGoalParity -count=1 -update-sdk-vocabulary` in infrix-core)", err)
	}
	var doc struct {
		Count int `json:"count"`
		Goals []struct {
			Goal string `json:"goal"`
		} `json:"goals"`
		Priorities []string `json:"priorities"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return vocabulary{}, fmt.Errorf("%s is not valid JSON: %w", vocabularyRel, err)
	}
	if len(doc.Goals) == 0 {
		return vocabulary{}, fmt.Errorf("%s lists no goals", vocabularyRel)
	}
	if doc.Count != len(doc.Goals) {
		return vocabulary{}, fmt.Errorf("%s declares count %d but lists %d goals", vocabularyRel, doc.Count, len(doc.Goals))
	}
	seen := map[string]bool{}
	goals := make([]goalConst, 0, len(doc.Goals))
	for _, g := range doc.Goals {
		if !wireShape.MatchString(g.Goal) {
			return vocabulary{}, fmt.Errorf("%s: %q is not an UPPER_SNAKE_CASE goal wire string", vocabularyRel, g.Goal)
		}
		if seen[g.Goal] {
			return vocabulary{}, fmt.Errorf("%s lists %s twice", vocabularyRel, g.Goal)
		}
		seen[g.Goal] = true
		goals = append(goals, goalConst{Wire: g.Goal})
	}
	if len(doc.Priorities) == 0 {
		return vocabulary{}, fmt.Errorf("%s lists no priorities; refresh it from infrix-core, whose fence writes the priorities admission validates", vocabularyRel)
	}
	seenPriority := map[string]bool{}
	for _, p := range doc.Priorities {
		if !priorityShape.MatchString(p) {
			return vocabulary{}, fmt.Errorf("%s: %q is not a lowercase priority word", vocabularyRel, p)
		}
		if seenPriority[p] {
			return vocabulary{}, fmt.Errorf("%s lists the priority %s twice", vocabularyRel, p)
		}
		seenPriority[p] = true
	}
	return vocabulary{Goals: goals, Priorities: append([]string(nil), doc.Priorities...)}, nil
}

// assertPublishedFloor fails when the pinned, published infrix-schema declares a
// goal or a priority the vendored vocabulary lacks.
func assertPublishedFloor(vocab vocabulary, published []goalConst, publishedPriorities []string) error {
	have := make(map[string]bool, len(vocab.Goals))
	for _, g := range vocab.Goals {
		have[g.Wire] = true
	}
	var missing []string
	for _, g := range published {
		if !have[g.Wire] {
			missing = append(missing, g.Wire)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return fmt.Errorf("the pinned infrix-schema declares %d goal(s) the vendored %s lacks: %v — refresh it from infrix-core "+
			"(`go test ./pkg/release -run SDKGoalParity -count=1 -update-sdk-vocabulary`) and re-run sdkgen", len(missing), vocabularyRel, missing)
	}
	havePriority := make(map[string]bool, len(vocab.Priorities))
	for _, p := range vocab.Priorities {
		havePriority[p] = true
	}
	for _, p := range publishedPriorities {
		if !havePriority[p] {
			missing = append(missing, p)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return fmt.Errorf("the pinned infrix-schema declares %d priority(ies) the vendored %s lacks: %v — refresh it from infrix-core "+
			"(`go test ./pkg/release -run SDKGoalParity -count=1 -update-sdk-vocabulary`) and re-run sdkgen", len(missing), vocabularyRel, missing)
	}
	return nil
}

// generate runs every target. When check is true it writes nothing and returns
// the labels that WOULD change; otherwise it rewrites in place.
func generate(repoRoot string, check bool) ([]string, error) {
	vocab, err := loadVocabulary(repoRoot)
	if err != nil {
		return nil, err
	}
	src, err := resolveSchemaGoalSource()
	if err != nil {
		return nil, err
	}
	published, err := parseGoals(src)
	if err != nil {
		return nil, err
	}
	publishedPriorities, err := parsePriorities(src)
	if err != nil {
		return nil, err
	}
	if err := assertPublishedFloor(vocab, published, publishedPriorities); err != nil {
		return nil, err
	}
	var changed []string
	for _, t := range allTargets() {
		ch, err := applyTarget(repoRoot, t, vocab, check)
		if err != nil {
			return changed, err
		}
		if ch {
			changed = append(changed, t.Label)
		}
	}
	return changed, nil
}

func applyTarget(repoRoot string, t target, vocab vocabulary, check bool) (bool, error) {
	full := filepath.Join(repoRoot, t.RelPath)
	raw, err := os.ReadFile(full)
	if err != nil {
		return false, fmt.Errorf("%s: read: %w", t.Label, err)
	}
	srcStr := string(raw)
	begin, end := beginMarker(t.Region), endMarker(t.Region)

	bIdx := strings.Index(srcStr, begin)
	if bIdx < 0 {
		return false, fmt.Errorf("%s: BEGIN marker %s not found in %s", t.Label, begin, t.RelPath)
	}
	if strings.Count(srcStr, begin) != 1 {
		return false, fmt.Errorf("%s: BEGIN marker %s appears more than once in %s", t.Label, begin, t.RelPath)
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

	endIdx := strings.Index(srcStr[bodyStart:], end)
	if endIdx < 0 {
		return false, fmt.Errorf("%s: END marker %s not found after BEGIN in %s", t.Label, end, t.RelPath)
	}
	endIdx += bodyStart
	endLineStart := endIdx
	for endLineStart > bodyStart && srcStr[endLineStart-1] != '\n' {
		endLineStart--
	}

	rendered := t.Render(vocab, indent)
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

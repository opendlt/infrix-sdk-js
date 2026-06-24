// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// repoRoot resolves the infrix-sdk-js repo root from this tool's source
// location (tools/sdkgen -> ../..).
func repoRoot() string {
	_, thisFile, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(thisFile), "..", "..")
}

func main() {
	check := flag.Bool("check", false, "verify the SDK goal-type regions match infrix-schema (no writes); exit 1 on drift")
	flag.Parse()

	changed, err := generate(repoRoot(), *check)
	if err != nil {
		fmt.Fprintln(os.Stderr, "sdkgen:", err)
		os.Exit(1)
	}
	if *check {
		if len(changed) > 0 {
			fmt.Fprintf(os.Stderr, "sdkgen: stale SDK goal-type regions (regenerate with `go run .`): %v\n", changed)
			os.Exit(1)
		}
		fmt.Println("sdkgen: SDK goal types are in sync with infrix-schema")
		return
	}
	if len(changed) > 0 {
		fmt.Printf("sdkgen: regenerated %v\n", changed)
	} else {
		fmt.Println("sdkgen: already in sync with infrix-schema")
	}
}

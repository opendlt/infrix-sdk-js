// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

package main

import "testing"

// TestSDKGoalTypesInSyncWithSchema is the cross-repo goal-type parity guarantee:
// the committed TypeScript + AssemblyScript IntentGoalType regions must match
// the canonical vocabulary in the PUBLISHED infrix-schema module. A goal added
// to the schema without regenerating these SDKs (run `go run .` in this dir)
// fails here. This is the per-repo replacement for the monorepo's old
// sdk_goal_parity fence, now that the SDKs live and version independently.
func TestSDKGoalTypesInSyncWithSchema(t *testing.T) {
	changed, err := generate(repoRoot(), true)
	if err != nil {
		t.Fatalf("sdkgen check against infrix-schema: %v", err)
	}
	if len(changed) > 0 {
		t.Errorf("SDK goal-type regions are stale vs infrix-schema; regenerate with `go run .`: %v", changed)
	}
}

// sdkgen keeps this repo's TypeScript + AssemblyScript IntentGoalType constants
// in lock-step with the published infrix-schema contract module. It is a
// dev/CI-only tool module (the SDK packages themselves are JS/TS/AS).
module github.com/opendlt/infrix-sdk-js/tools/sdkgen

go 1.25.7

require github.com/opendlt/infrix-schema v0.2.0

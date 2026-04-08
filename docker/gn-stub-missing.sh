#!/usr/bin/env bash
set -euo pipefail

# Repeatedly run `gn gen` and auto-stub any missing BUILD.gn files or targets.

GN_ARGS="$1"
MAX_ITERATIONS=30

for i in $(seq 1 $MAX_ITERATIONS); do
    echo "==> gn gen attempt $i/$MAX_ITERATIONS"
    output=$(gn gen out/Release --args="$GN_ARGS" 2>&1) && {
        echo "==> gn gen succeeded on attempt $i"
        exit 0
    }

    handled=false

    # Case 1: Unable to load a BUILD.gn file
    # e.g.: Unable to load "/chromium/src/foo/bar/BUILD.gn".
    missing_file=$(echo "$output" | grep -o 'Unable to load "[^"]*"' | head -1 | sed 's|Unable to load "/chromium/src/||; s|"||g')
    if [ -n "$missing_file" ]; then
        dir=$(dirname "$missing_file")
        # Extract the target name from the referencing line (//path:target_name)
        target_name=$(echo "$output" | grep -oP '"//[^:]+:\K[^"(]+' | head -1 || true)
        echo "==> Stubbing file: $missing_file (target: ${target_name:-none})"
        mkdir -p "$dir"
        if [ -n "$target_name" ]; then
            echo "group(\"$target_name\") { }" > "$missing_file"
        else
            echo "# auto-stub" > "$missing_file"
        fi
        handled=true
    fi

    # Case 2: Unresolved dependencies
    # e.g.: needs //components/foo:bar_target(//build/toolchain/linux:clang_x64)
    if [ "$handled" = false ]; then
        while IFS= read -r line; do
            if echo "$line" | grep -qP 'needs //'; then
                gn_ref=$(echo "$line" | grep -oP 'needs //\K[^(]+' | head -1)
                if [ -n "$gn_ref" ]; then
                    gn_path=$(echo "$gn_ref" | cut -d: -f1)
                    target_name=$(echo "$gn_ref" | cut -d: -f2)
                    build_file="$gn_path/BUILD.gn"
                    echo "==> Adding missing target '$target_name' to $build_file"
                    mkdir -p "$gn_path"
                    echo "group(\"$target_name\") { }" >> "$build_file"
                    handled=true
                fi
            fi
        done <<< "$output"
    fi

    if [ "$handled" = false ]; then
        echo "==> gn gen failed with unhandled error:"
        echo "$output" | tail -20
        exit 1
    fi
done

echo "==> Failed after $MAX_ITERATIONS iterations"
exit 1

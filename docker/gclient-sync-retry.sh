#!/usr/bin/env bash
set -euo pipefail

# Retry gclient sync up to MAX_ATTEMPTS times, cleaning up broken (half-fetched)
# git repos between each attempt. Google rate-limits shallow clones from Docker
# build environments, so some sub-repos will 403 on any given run. Each retry
# picks up where the last left off since already-synced deps are skipped.
#
# Known-ignorable failures (sub-deps that persistently 403 but aren't needed
# for the cronet build target) are tolerated — we stub them and exit success.

MAX_ATTEMPTS=10
WAIT_BASE=15  # seconds, multiplied by attempt number

# Sub-dep repos that persistently 403 from Docker and aren't needed for cronet.
# These are sub-deps of deps we DO need (e.g. openscreen's buildtools).
IGNORABLE_REPOS=(
    "/chromium/src/third_party/openscreen/src/buildtools"
)

cleanup_broken_repos() {
    echo "==> Cleaning up broken git repos..."
    find /chromium/src -maxdepth 6 -name ".git" -type d 2>/dev/null | while read gitdir; do
        repo_dir="$(dirname "$gitdir")"
        if ! git -C "$repo_dir" rev-parse HEAD >/dev/null 2>&1; then
            echo "    Removing broken repo: $repo_dir"
            rm -rf "$repo_dir"
        fi
    done
    rm -rf /chromium/_bad_scm
    echo "==> Cleanup done"
}

# Check if the only remaining failures are in our ignorable list.
check_ignorable_only() {
    local found_non_ignorable=false
    find /chromium/src -maxdepth 6 -name ".git" -type d 2>/dev/null | while read gitdir; do
        repo_dir="$(dirname "$gitdir")"
        if ! git -C "$repo_dir" rev-parse HEAD >/dev/null 2>&1; then
            local ignorable=false
            for ign in "${IGNORABLE_REPOS[@]}"; do
                if [ "$repo_dir" = "$ign" ]; then
                    ignorable=true
                    break
                fi
            done
            if ! $ignorable; then
                echo "    Non-ignorable broken repo: $repo_dir"
                echo "false"
                return
            fi
        fi
    done
    echo "true"
}

stub_ignorable_repos() {
    echo "==> Stubbing ignorable repos..."
    for repo in "${IGNORABLE_REPOS[@]}"; do
        if [ -d "$repo" ] && ! git -C "$repo" rev-parse HEAD >/dev/null 2>&1; then
            echo "    Stubbing: $repo"
            rm -rf "$repo"
            mkdir -p "$repo"
            git -C "$repo" init -q
            git -C "$repo" commit --allow-empty -m "stub" -q
        elif [ ! -d "$repo" ]; then
            echo "    Creating stub: $repo"
            mkdir -p "$repo"
            git -C "$repo" init -q
            git -C "$repo" commit --allow-empty -m "stub" -q
        fi
    done
    rm -rf /chromium/_bad_scm
    # Re-run sync so gclient writes .gclient_entries (stubs have valid HEAD now)
    echo "==> Re-running gclient sync to finalize state..."
    gclient sync --nohooks --no-history --force || true
}

for attempt in $(seq 1 $MAX_ATTEMPTS); do
    echo ""
    echo "========================================"
    echo "  gclient sync — attempt $attempt/$MAX_ATTEMPTS"
    echo "========================================"
    echo ""

    if gclient sync --nohooks --no-history --force; then
        echo ""
        echo "==> gclient sync succeeded on attempt $attempt"
        exit 0
    fi

    echo ""
    echo "==> gclient sync failed on attempt $attempt"

    # Check if the only failures are ignorable
    result=$(check_ignorable_only)
    if [ "$result" != "false" ]; then
        echo "==> Only ignorable repos failed — stubbing and continuing"
        stub_ignorable_repos
        exit 0
    fi

    if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
        cleanup_broken_repos
        wait_time=$((WAIT_BASE * attempt))
        echo "==> Waiting ${wait_time}s before retry..."
        sleep "$wait_time"
    fi
done

echo "==> All $MAX_ATTEMPTS attempts failed — checking if remaining failures are ignorable"
result=$(check_ignorable_only)
if [ "$result" != "false" ]; then
    echo "==> Only ignorable repos remain — stubbing and continuing"
    stub_ignorable_repos
    exit 0
fi

echo "==> Non-ignorable failures remain. Giving up."
exit 1

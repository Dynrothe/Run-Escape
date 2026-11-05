#!/usr/bin/env bash
# The Tombs of Amascut's balance sweep: every room the bot plays, at each raid level, for each kit,
# a line each (what simulate-tombs.ts says at the end). Slow: run it in the background.
#
#   scripts/game/sweep-tombs.sh > sweep.txt
#   ROOMS="baba akkha" LEVELS="0 150" KITS="zero" CHARACTERS="wizard" SEEDS=2 scripts/game/sweep-tombs.sh
#
#   KITS: zero (nothing bought), shop (META=max), all (META=max ARMOURY=max), dev (KIT=max)
#   JOBS=3 runs that many at once
ROOMS=${ROOMS:-"apmeken het scabaras crondis baba akkha kephri zebak wardens"}
LEVELS=${LEVELS:-"0 150 300 400 500"}
KITS=${KITS:-"zero shop all"}
CHARACTERS=${CHARACTERS:-"warrior wizard ranger"}
SEEDS=${SEEDS:-2}
JOBS=${JOBS:-3}
cd "$(dirname "$0")/../.."

one() {
    local room=$1 level=$2 kit=$3 character=$4
    local env=(DEV_MAPS=1 ROOM="$room" INVOCATIONS="level:$level")
    case $kit in
        shop) env+=(META=max) ;;
        all) env+=(META=max ARMOURY=max) ;;
        dev) env+=(KIT=max) ;;
    esac
    # A room gets 25 minutes, the Wardens (after the raid up to them) 30
    [ "$room" = wardens ] && env+=(MINUTES=30) || env+=(MINUTES=25)
    local out
    out=$(env "${env[@]}" node node_modules/tsx/dist/cli.mjs scripts/game/simulate-tombs.ts \
        "$character" "$SEEDS" 2>&1)
    local summary best never
    summary=$(echo "$out" | grep -E "^[0-9]+/[0-9]+ done" | tail -1)
    best=$(echo "$out" | grep -oE "best [0-9]+% left" | sed 's/best //; s/ left//' | tr '\n' ' ')
    never=$(echo "$out" | grep -c "never got there")
    printf '%-8s %3s %-4s %-8s %s%s%s\n' "$room" "$level" "$kit" "$character" "$summary" \
        "${best:+ | boss best $best}" "$([ "$never" != 0 ] && echo " | never reached $never")"
}

for room in $ROOMS; do
    for level in $LEVELS; do
        for kit in $KITS; do
            for character in $CHARACTERS; do
                while [ "$(jobs -r | wc -l)" -ge "$JOBS" ]; do
                    wait -n
                done
                one "$room" "$level" "$kit" "$character" &
            done
        done
    done
done
wait
echo finished

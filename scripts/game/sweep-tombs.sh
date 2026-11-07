#!/usr/bin/env bash
# The Tombs of Amascut's balance sweep: every room the bot plays, at each raid level, for each kit,
# a line each (what simulate-tombs.ts says at the end). Slow: run it in the background.
#
#   scripts/game/sweep-tombs.sh > sweep.txt
#   ROOMS="baba akkha" LEVELS="0 150" KITS="zero" CHARACTERS="wizard" SEEDS=2 scripts/game/sweep-tombs.sh
#
#   KITS, the account's state, caskets dropping as they always do: zero (nothing bought), mid (half
#   the shop's ranks and half of each Armoury line: META=mid ARMOURY=mid), all (everything:
#   META=max ARMOURY=max); shop (META=max alone) and dev (KIT=max, the dev kit) on request
#   RAW=dir keeps each run's whole output there, a file a line (room-level-kit-character.txt)
#   JOBS=3 runs that many at once (with bash's `wait -n`: bash 4.3 or later, as Git Bash is;
#   macOS's own bash 3.2 isn't)
ROOMS=${ROOMS:-"apmeken het scabaras crondis baba akkha kephri zebak wardens"}
LEVELS=${LEVELS:-"0 150 300 400 500"}
KITS=${KITS:-"zero mid all"}
CHARACTERS=${CHARACTERS:-"warrior wizard ranger"}
SEEDS=${SEEDS:-2}
JOBS=${JOBS:-3}
cd "$(dirname "$0")/../.."

one() {
    local room=$1 level=$2 kit=$3 character=$4
    local env=(DEV_MAPS=1 ROOM="$room" INVOCATIONS="level:$level")
    case $kit in
        shop) env+=(META=max) ;;
        mid) env+=(META=mid ARMOURY=mid) ;;
        all) env+=(META=max ARMOURY=max) ;;
        dev) env+=(KIT=max) ;;
    esac
    # A room gets 25 minutes, the Wardens (after the raid up to them) 30, and the whole raid the
    # sim's 90 (a won Expert raid takes 20 or 30)
    case $room in
        wardens) env+=(MINUTES=30) ;;
        raid) env+=(MINUTES=90) ;;
        *) env+=(MINUTES=25) ;;
    esac
    local out
    out=$(env "${env[@]}" node node_modules/tsx/dist/cli.mjs scripts/game/simulate-tombs.ts \
        "$character" "$SEEDS" 2>&1)
    if [ -n "$RAW" ]; then
        mkdir -p "$RAW" && echo "$out" > "$RAW/$room-$level-$kit-$character.txt"
    fi
    local summary best never
    summary=$(echo "$out" | grep -E "^[0-9]+/[0-9]+ done" | tail -1)
    best=$(echo "$out" | grep -oE "best [0-9]+% left" | sed 's/best //; s/ left//' | tr '\n' ' ')
    never=$(echo "$out" | grep -c "never got there")
    # How far each seed got: "4p W3" is four paths and the Wardens' third phase
    local far
    far=$(echo "$out" | grep -oE "got to: [0-9]+ paths(, Wardens phase [0-9])?(, won)?" |
        sed -e 's/got to: //' -e 's/ paths/p/' -e 's/, Wardens phase / W/' -e 's/, won/ won/' |
        paste -sd ';' -)
    printf '%-8s %3s %-4s %-8s %s%s%s%s\n' "$room" "$level" "$kit" "$character" "$summary" \
        "${far:+ | got to $far}" \
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

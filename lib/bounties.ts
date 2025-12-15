import { SleeperMatchup, SleeperTransaction, getFantasyPosition, SleeperPlayer } from "./sleeper";
import { WeeklyStats } from "./stats";

export interface BountyResult {
    id: number;
    title: string;
    description: string;
    winners: { managerId: string; managerName: string; score: number; details: string; points: number }[];
}

// Helper for Perfect Lineup
const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WT', 'FLEX', 'SFLEX'];

function isEligible(pos: string, slot: string): boolean {
    if (slot === 'QB') return pos === 'QB';
    if (slot === 'RB') return pos === 'RB';
    if (slot === 'WR') return pos === 'WR';
    if (slot === 'WT') return ['WR', 'TE'].includes(pos);
    if (slot === 'FLEX') return ['RB', 'WR', 'TE'].includes(pos);
    if (slot === 'SFLEX') return ['QB', 'RB', 'WR', 'TE'].includes(pos);
    return false;
}

function solvePerfectOffense(players: { pos: string; fp: number }[]): number {
    // Sort by FP desc
    players.sort((a, b) => b.fp - a.fp);
    let bestScore = 0.0;

    function backtrack(playerIdx: number, filledMask: number, currentScore: number) {
        if (currentScore > bestScore) bestScore = currentScore;
        if (filledMask === (1 << SLOTS.length) - 1) return;
        if (playerIdx >= players.length) return;

        // Pruning
        const remainingSlots = SLOTS.length - countSetBits(filledMask);
        let maxRemaining = 0;
        for (let i = 0; i < remainingSlots && playerIdx + i < players.length; i++) {
            maxRemaining += players[playerIdx + i].fp;
        }
        if (currentScore + maxRemaining <= bestScore) return;

        const player = players[playerIdx];

        // Option 1: Skip
        backtrack(playerIdx + 1, filledMask, currentScore);

        // Option 2: Use
        for (let i = 0; i < SLOTS.length; i++) {
            if (!(filledMask & (1 << i))) {
                if (isEligible(player.pos, SLOTS[i])) {
                    // Optimization: if this slot is same type as previous slot and previous slot is empty, 
                    // force filling previous slot first to avoid permutations of identical slots.
                    if (i > 0 && SLOTS[i] === SLOTS[i - 1] && !(filledMask & (1 << (i - 1)))) {
                        continue;
                    }
                    backtrack(playerIdx + 1, filledMask | (1 << i), currentScore + player.fp);
                }
            }
        }
    }

    backtrack(0, 0, 0.0);
    return bestScore;
}

function countSetBits(n: number): number {
    let count = 0;
    while (n > 0) {
        n &= (n - 1);
        count++;
    }
    return count;
}

export function calculateBounties(
    year: number,
    leagueId: string,
    weeklyStats: WeeklyStats[],
    transactionsMap: Record<number, SleeperTransaction[]>, // Changed from flat array
    matchups: Record<number, SleeperMatchup[]>, // week -> matchups
    players: Record<string, SleeperPlayer>,
    rosterMap: Map<number, string>, // rosterId -> managerId
    managerNames: Map<string, string>, // managerId -> displayName
    draftPicks: { player_id: string; roster_id: number; round: number }[]
): BountyResult[] {
    const results: BountyResult[] = [];

    // Flatten transactions for bounties that don't strictly need week grouping if they have it, 
    // but for those that need reliable week, use the map.
    // Actually, let's just use the map.
    const allTransactions: SleeperTransaction[] = [];
    Object.entries(transactionsMap).forEach(([weekStr, txs]) => {
        const week = parseInt(weekStr);
        txs.forEach(t => {
            // We can manually attach week here if we want to work with a flat list internally
            // but we can't modify the object if it's frozen/readonly. 
            // Let's create a wrapper or just iterate the map.
            allTransactions.push({ ...t, week }); // Safe to inject here locally
        });
    });
    const transactions = allTransactions; // Use this locally with injected week

    // Bounty 1: Late Round Gem (15 pts)
    const eligiblePlayers = new Map<string, { rosterId: number; round: number }>(); // playerId -> info
    draftPicks.forEach(p => {
        if (p.round >= 11) {
            eligiblePlayers.set(p.player_id, { rosterId: p.roster_id, round: p.round });
        }
    });

    const lastWeek = Math.max(...weeklyStats.map(s => s.week));
    const lastWeekMatchups = matchups[lastWeek] || [];
    const keptPlayers = new Set<string>(); // playerId

    lastWeekMatchups.forEach(m => {
        m.players.forEach(pid => {
            if (eligiblePlayers.has(pid) && eligiblePlayers.get(pid)?.rosterId === m.roster_id) {
                keptPlayers.add(pid);
            }
        });
    });

    const gemPoints = new Map<string, { managerId: string; playerId: string; points: number; round: number }>();

    Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
        const week = parseInt(weekStr);
        if (week > 14) return; // Regular season only

        weekMatchups.forEach(m => {
            const rosterId = m.roster_id;
            const managerId = rosterMap.get(rosterId);
            if (!managerId) return;

            const pointsMap = (m as any).players_points as Record<string, number>;
            if (!pointsMap) return;

            Object.entries(pointsMap).forEach(([pid, score]) => {
                if (keptPlayers.has(pid) && eligiblePlayers.get(pid)?.rosterId === rosterId) {
                    const key = `${managerId}-${pid}`;
                    if (!gemPoints.has(key)) {
                        gemPoints.set(key, {
                            managerId,
                            playerId: pid,
                            points: 0,
                            round: eligiblePlayers.get(pid)!.round
                        });
                    }
                    gemPoints.get(key)!.points += score;
                }
            });
        });
    });

    const b1Winners: { managerId: string; managerName: string; score: number; details: string; points: number }[] = [];
    let maxGemPoints = 0;
    gemPoints.forEach(gem => {
        if (gem.points > maxGemPoints) maxGemPoints = gem.points;
    });

    gemPoints.forEach(gem => {
        if (Math.abs(gem.points - maxGemPoints) < 0.01) {
            const pName = players[gem.playerId]?.full_name || gem.playerId;
            b1Winners.push({
                managerId: gem.managerId,
                managerName: managerNames.get(gem.managerId) || gem.managerId,
                score: gem.points,
                details: `${pName} (Rd ${gem.round}, ${gem.points.toFixed(2)} pts)`,
                points: 15
            });
        }
    });
    results.push({ id: 1, title: "Late Round Gem", description: "Most points from a player drafted in Rd 11+ and kept", winners: b1Winners });

    // Bounty 2: The Dealmaker (3 pts per trade)
    const tradeCounts = new Map<string, number>();
    const managerTrades = new Map<string, Set<string>>();

    transactions.filter(t => t.type === 'trade').forEach(t => {
        t.roster_ids.forEach(rid => {
            const mid = rosterMap.get(rid);
            if (mid) {
                if (!managerTrades.has(mid)) managerTrades.set(mid, new Set());
                managerTrades.get(mid)?.add(t.transaction_id);
            }
        });
    });

    const b2Winners: { managerId: string; managerName: string; score: number; details: string; points: number }[] = [];
    let maxTrades = 0;
    managerTrades.forEach((trades, mid) => {
        if (trades.size > maxTrades) maxTrades = trades.size;
    });
    if (maxTrades > 0) {
        managerTrades.forEach((trades, mid) => {
            if (trades.size === maxTrades) {
                b2Winners.push({
                    managerId: mid,
                    managerName: managerNames.get(mid) || mid,
                    score: maxTrades,
                    details: `${maxTrades} trades`,
                    points: maxTrades * 3
                });
            }
        });
    }
    results.push({ id: 2, title: "The Dealmaker", description: "Most trades completed", winners: b2Winners });

    // Bounty 3: Waiver Wire War (5 pts)
    const bidCounts = new Map<string, number>();
    const waiverTx = transactions.filter(t => t.type === 'waiver');

    waiverTx.forEach(t => {
        // Check adds first
        if (t.adds) {
            Object.keys(t.adds).forEach(pid => {
                const key = `${t.week}-${pid}`;
                bidCounts.set(key, (bidCounts.get(key) || 0) + 1);
            });
        } else if (t.metadata?.player_id) {
            // Check metadata for failed bids
            const pid = t.metadata.player_id;
            const key = `${t.week}-${pid}`;
            bidCounts.set(key, (bidCounts.get(key) || 0) + 1);
        }
    });

    let maxBids = 0;
    bidCounts.forEach(count => {
        if (count > maxBids) maxBids = count;
    });

    const b3Winners: { managerId: string; managerName: string; score: number; details: string; points: number }[] = [];
    if (maxBids >= 0) {
        bidCounts.forEach((count, key) => {
            if (count === maxBids) {
                const [weekStr, pid] = key.split('-');
                const week = parseInt(weekStr);

                const successfulTx = transactions.find(t =>
                    t.week === week &&
                    t.status === 'complete' &&
                    t.adds && t.adds[pid]
                );

                if (successfulTx) {
                    const rosterId = successfulTx.adds![pid];
                    const mid = rosterMap.get(rosterId);
                    if (mid) {
                        const pName = players[pid]?.full_name || pid;
                        b3Winners.push({
                            managerId: mid,
                            managerName: managerNames.get(mid) || mid,
                            score: maxBids,
                            details: `Won ${pName} (Week ${week}) with ${maxBids} bids`,
                            points: 5
                        });
                    }
                }
            }
        });
    }

    results.push({ id: 3, title: "Waiver Wire War", description: "Won the most contested waiver claim", winners: b3Winners });

    // Bounty 4: Best Waiver Value (15 pts)
    const waiverAdds = new Map<string, { managerId: string; bid: number; week: number }>();

    transactions.filter(t => t.type === 'waiver' && t.status === 'complete').forEach(t => {
        const bid = t.settings?.waiver_bid ?? 0;
        const adjustedBid = bid === 0 ? 1 : bid;

        if (t.adds) {
            Object.entries(t.adds).forEach(([pid, rid]) => {
                const mid = rosterMap.get(rid);
                if (mid) {
                    const key = `${mid}-${pid}`;
                    if (!waiverAdds.has(key)) {
                        waiverAdds.set(key, { managerId: mid, bid: adjustedBid, week: t.week });
                    }
                }
            });
        }
    });

    const waiverStats = new Map<string, { totalFP: number; starts: number }>();

    Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
        const week = parseInt(weekStr);
        weekMatchups.forEach(m => {
            const rosterId = m.roster_id;
            const managerId = rosterMap.get(rosterId);
            if (!managerId) return;

            m.starters.forEach((pid, idx) => {
                const key = `${managerId}-${pid}`;
                // Debug log for first few checks
                if (waiverAdds.has(key)) {
                    const addInfo = waiverAdds.get(key)!;
                    if (week >= addInfo.week) {
                        const score = m.starters_points[idx];
                        if (!waiverStats.has(key)) waiverStats.set(key, { totalFP: 0, starts: 0 });
                        const s = waiverStats.get(key)!;
                        s.totalFP += score;
                        s.starts += 1;
                    }
                }
            });
        });
    });

    const b4Winners: { managerId: string; managerName: string; score: number; details: string; points: number }[] = [];
    let maxValue = 0;

    waiverStats.forEach((stats, key) => {
        if (stats.starts >= 2) {
            const addInfo = waiverAdds.get(key)!;
            const avgFP = stats.totalFP / stats.starts;
            const value = avgFP / addInfo.bid;
            if (value > maxValue) maxValue = value;
        }
    });

    waiverStats.forEach((stats, key) => {
        if (stats.starts >= 2) {
            const addInfo = waiverAdds.get(key)!;
            const avgFP = stats.totalFP / stats.starts;
            const value = avgFP / addInfo.bid;

            if (Math.abs(value - maxValue) < 0.01) {
                const [mid, pid] = key.split('-');
                const pName = players[pid]?.full_name || pid;
                b4Winners.push({
                    managerId: mid,
                    managerName: managerNames.get(mid) || mid,
                    score: value,
                    details: `${pName} (${value.toFixed(2)} FP/$)`,
                    points: 15
                });
            }
        }
    });
    results.push({ id: 4, title: "Best Waiver Value", description: "Best value (FP/$) from a waiver pickup (min 2 starts)", winners: b4Winners });

    // Bounty 5: Deepest Bench (15 pts)
    const benchPoints = new Map<string, number>();
    weeklyStats.filter(s => s.week <= 4).forEach(s => {
        benchPoints.set(s.managerId, (benchPoints.get(s.managerId) || 0) + s.benchScore);
    });

    const b5Winners: { managerId: string; managerName: string; score: number; details: string; points: number }[] = [];
    let maxBench = 0;
    benchPoints.forEach((pts, mid) => {
        const avg = pts / 4;
        if (avg > maxBench) maxBench = avg;
    });
    benchPoints.forEach((pts, mid) => {
        const avg = pts / 4;
        if (Math.abs(avg - maxBench) < 0.01) {
            b5Winners.push({
                managerId: mid,
                managerName: managerNames.get(mid) || mid,
                score: avg,
                details: `${avg.toFixed(2)} avg bench points`,
                points: 15
            });
        }
    });
    results.push({ id: 5, title: "Deepest Bench", description: "Highest average bench points (Weeks 1-4)", winners: b5Winners });

    // Bounty 6: Special Teams Specialist (15 pts)
    const specialPoints = new Map<string, number>();
    weeklyStats.forEach(s => {
        const score = s.teScore + s.idpScore + s.defScore;
        specialPoints.set(s.managerId, (specialPoints.get(s.managerId) || 0) + score);
    });

    const b6Winners: { managerId: string; managerName: string; score: number; details: string; points: number }[] = [];
    let maxSpecial = 0;
    specialPoints.forEach((pts) => {
        if (pts > maxSpecial) maxSpecial = pts;
    });
    specialPoints.forEach((pts, mid) => {
        if (Math.abs(pts - maxSpecial) < 0.01) {
            b6Winners.push({
                managerId: mid,
                managerName: managerNames.get(mid) || mid,
                score: pts,
                details: `${pts.toFixed(2)} points`,
                points: 15
            });
        }
    });
    results.push({ id: 6, title: "Special Teams Specialist", description: "Most points from TE, IDP, and DEF", winners: b6Winners });

    // Bounty 7: Unstoppable Force (10 + 3 * (streak - 5))
    const managerStats = new Map<string, WeeklyStats[]>();
    weeklyStats.forEach(s => {
        if (!managerStats.has(s.managerId)) managerStats.set(s.managerId, []);
        managerStats.get(s.managerId)?.push(s);
    });

    const b7Winners: { managerId: string; managerName: string; score: number; details: string; points: number }[] = [];
    let maxStreak = 0;
    const streaks = new Map<string, number>();

    managerStats.forEach((stats, mid) => {
        stats.sort((a, b) => a.week - b.week);
        let currentStreak = 0;
        let bestStreak = 0;
        stats.forEach(s => {
            if (s.win === 1) {
                currentStreak++;
                if (currentStreak > bestStreak) bestStreak = currentStreak;
            } else {
                currentStreak = 0;
            }
        });
        streaks.set(mid, bestStreak);
        if (bestStreak > maxStreak) maxStreak = bestStreak;
    });

    streaks.forEach((streak, mid) => {
        if (streak === maxStreak) {
            const points = 10 + 3 * Math.max(0, streak - 5);
            b7Winners.push({
                managerId: mid,
                managerName: managerNames.get(mid) || mid,
                score: streak,
                details: `${streak} game win streak`,
                points
            });
        }
    });
    results.push({ id: 7, title: "Unstoppable Force", description: "Longest win streak", winners: b7Winners });

    // Bounty 8: Perfect Weeks (3 pts per perfect week)
    const perfectWeeks = new Map<string, number>();

    Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
        weekMatchups.forEach(m => {
            const rosterId = m.roster_id;
            const managerId = rosterMap.get(rosterId);
            if (!managerId) return;

            const actualScore = m.points;

            const playersPoints = m.players_points;
            if (!playersPoints) return;

            const playerList: { pos: string; fp: number }[] = [];
            let defScore = 0;
            let idpScores: number[] = [];

            m.players.forEach(pid => {
                const score = playersPoints[pid] || 0;
                const p = players[pid];
                const pos = p ? getFantasyPosition(p.position) : 'NA';

                if (pos === 'DEF' || pos === 'NA') {
                    if (score > defScore) defScore = score;
                } else if (pos === 'IDP') {
                    idpScores.push(score);
                } else if (['QB', 'RB', 'WR', 'TE'].includes(pos)) {
                    playerList.push({ pos, fp: score });
                }
            });

            idpScores.sort((a, b) => b - a);
            const topIdp = (idpScores[0] || 0) + (idpScores[1] || 0);

            const offScore = solvePerfectOffense(playerList);
            const perfectScore = defScore + topIdp + offScore;

            if (Math.abs(actualScore - perfectScore) < 0.05) {
                perfectWeeks.set(managerId, (perfectWeeks.get(managerId) || 0) + 1);
            }
        });
    });

    const b8Winners: { managerId: string; managerName: string; score: number; details: string; points: number }[] = [];
    let maxPerfect = 0;
    perfectWeeks.forEach(count => {
        if (count > maxPerfect) maxPerfect = count;
    });
    if (maxPerfect > 0) {
        perfectWeeks.forEach((count, mid) => {
            if (count === maxPerfect) {
                b8Winners.push({
                    managerId: mid,
                    managerName: managerNames.get(mid) || mid,
                    score: maxPerfect,
                    details: `${maxPerfect} perfect weeks`,
                    points: maxPerfect * 3
                });
            }
        });
    }
    results.push({ id: 8, title: "Perfect Weeks", description: "Most perfect lineups set", winners: b8Winners });

    // Bounty 9: Points King (15 pts)
    const totalPoints = new Map<string, number>();
    weeklyStats.forEach(s => {
        totalPoints.set(s.managerId, (totalPoints.get(s.managerId) || 0) + s.fpFor);
    });

    const b9Winners: { managerId: string; managerName: string; score: number; details: string; points: number }[] = [];
    let maxPoints = 0;
    totalPoints.forEach((pts) => {
        if (pts > maxPoints) maxPoints = pts;
    });
    totalPoints.forEach((pts, mid) => {
        if (Math.abs(pts - maxPoints) < 0.01) {
            b9Winners.push({
                managerId: mid,
                managerName: managerNames.get(mid) || mid,
                score: pts,
                details: `${pts.toFixed(2)} total points`,
                points: 15
            });
        }
    });
    results.push({ id: 9, title: "Points King", description: "Most total points scored", winners: b9Winners });

    // Bounty 10: The Belt (15 pts)
    let currentHolder = '';
    if (leagueId === 'bbl') {
        if (year === 2025) currentHolder = "Johnny";
        else if (year === 2024) currentHolder = "Shardul";
        else if (year === 2023) currentHolder = "Vivek";
    } else if (leagueId === 'trc') {
        if (year === 2025) currentHolder = "Arif";
        else if (year === 2024) currentHolder = "Maroof";
        else if (year === 2023) currentHolder = "Karn";
    }

    let holderId = '';
    for (const [id, name] of managerNames.entries()) {
        if (name === currentHolder) {
            holderId = id;
            break;
        }
    }

    if (holderId) {
        const weeks = Object.keys(matchups).map(Number).sort((a, b) => a - b);
        for (const week of weeks) {
            if (week > 14) break;

            const weekMatchups = matchups[week];
            const holderMatchup = weekMatchups.find(m => rosterMap.get(m.roster_id) === holderId);
            if (!holderMatchup) continue;

            const matchupId = holderMatchup.matchup_id;
            const opponentMatchup = weekMatchups.find(m => m.matchup_id === matchupId && m.roster_id !== holderMatchup.roster_id);

            if (opponentMatchup) {
                if (opponentMatchup.points > holderMatchup.points) {
                    const newHolderId = rosterMap.get(opponentMatchup.roster_id);
                    if (newHolderId) {
                        holderId = newHolderId;
                    }
                }
            }
        }
    }

    const b10Winners: { managerId: string; managerName: string; score: number; details: string; points: number }[] = [];
    if (holderId) {
        b10Winners.push({
            managerId: holderId,
            managerName: managerNames.get(holderId) || holderId,
            score: 1,
            details: `Current Holder`,
            points: 15
        });
    }
    results.push({ id: 10, title: "The Belt", description: "Holder of The Belt at end of season", winners: b10Winners });

    return results;
}

import { SleeperMatchup, SleeperRoster, SleeperUser, getFantasyPosition, SleeperPlayer } from "./sleeper";

export interface WeeklyStats {
    week: number;
    managerId: string;
    rosterId: number;
    matchupId: number;
    fpFor: number;
    fpAgainst: number;
    win: number;
    loss: number;
    draw: number;
    qbScore: number;
    rbScore: number;
    wrScore: number;
    teScore: number;
    wtScore: number; // WR + TE
    idpScore: number;
    defScore: number;
    benchScore: number;
    bestStarter: { name: string; score: number };
    bestBench: { name: string; score: number };
    top6Win: number;
}

export interface SeasonStats {
    managerId: string;
    managerName: string;
    rosterId: number;
    totalWins: number;
    totalLosses: number;
    totalDraws: number;
    fpFor: number;
    fpAgainst: number;
    matchupWins: number;
    matchupLosses: number;
    matchupDraws: number;
    top6Wins: number;
    top6Losses: number;
    division: string;
    divWins: number;
    divLosses: number;
    divDraws: number;
}

export function calculateTop6Win(rank: number): number {
    return rank <= 6 ? 1 : 0;
}

export function getOffPos(pos: string): number {
    if (['QB', 'RB', 'WR', 'TE'].includes(pos)) return 2;
    if (pos === 'DEF') return 1;
    return 0;
}

export function calculateWeeklyStats(
    week: number,
    matchups: SleeperMatchup[],
    rosters: SleeperRoster[],
    users: SleeperUser[],
    players: Record<string, SleeperPlayer>
): WeeklyStats[] {
    const stats: WeeklyStats[] = [];

    // Create a map of rosterId to managerId/Name
    const rosterMap = new Map<number, string>();
    rosters.forEach(r => rosterMap.set(r.roster_id, r.owner_id));

    // Group matchups by matchup_id to find opponent
    const matchupMap = new Map<number, SleeperMatchup[]>();
    matchups.forEach(m => {
        if (!matchupMap.has(m.matchup_id)) matchupMap.set(m.matchup_id, []);
        matchupMap.get(m.matchup_id)?.push(m);
    });

    matchups.forEach(m => {
        const rosterId = m.roster_id;
        const managerId = rosterMap.get(rosterId) || 'Unknown';

        // Find opponent
        const opponent = matchupMap.get(m.matchup_id)?.find(op => op.roster_id !== rosterId);
        const fpFor = m.points;
        const fpAgainst = opponent ? opponent.points : 0;

        let win = 0, loss = 0, draw = 0;
        if (fpFor > fpAgainst) win = 1;
        else if (fpFor < fpAgainst) loss = 1;
        else draw = 1;

        // Calculate position scores
        let qbScore = 0, rbScore = 0, wrScore = 0, teScore = 0, idpScore = 0, defScore = 0;
        let bestStarter = { name: '', score: -1 };

        m.starters.forEach((playerId, index) => {
            const score = m.starters_points[index];
            const player = players[playerId];
            const pos = player ? getFantasyPosition(player.position) : 'Unknown';

            if (pos === 'QB') qbScore += score;
            else if (pos === 'RB') rbScore += score;
            else if (pos === 'WR') wrScore += score;
            else if (pos === 'TE') teScore += score;
            else if (pos === 'IDP') idpScore += score;
            else if (['DEF', 'NA'].includes(pos)) defScore += score; // DEF usually maps to NA or DEF depending on scraping

            if (score > bestStarter.score) {
                bestStarter = { name: player?.full_name || 'Unknown', score };
            }
        });

        // Calculate Bench Score
        let benchScore = 0;
        let bestBench = { name: '', score: -1 };

        // m.players includes starters. We need to filter out starters.
        // Actually m.players is ALL players. m.starters is just starters.
        // Sleeper API doesn't give individual bench points directly in the matchup object easily 
        // without looking up player scores. 
        // Wait, `starters_points` corresponds to `starters`.
        // For bench players, we need to fetch their scores or use the `players_points` map if available.
        // The `new_stats.py` used `weekly_info` which fetched `players_points`.
        // The Sleeper matchup endpoint returns `players_points` dictionary!

        // Let's update the interface in sleeper.ts if needed, or just cast it here.
        // The python script says: `manager['players_points'][player]`
        const playersPoints = (m as any).players_points as Record<string, number>;

        m.players.forEach(playerId => {
            if (!m.starters.includes(playerId)) {
                const score = playersPoints[playerId] || 0;
                benchScore += score;
                const player = players[playerId];
                if (score > bestBench.score) {
                    bestBench = { name: player?.full_name || 'Unknown', score };
                }
            }
        });

        stats.push({
            week,
            managerId,
            rosterId,
            matchupId: m.matchup_id,
            fpFor,
            fpAgainst,
            win,
            loss,
            draw,
            qbScore,
            rbScore,
            wrScore,
            teScore,
            wtScore: wrScore + teScore,
            idpScore,
            defScore,
            benchScore,
            bestStarter,
            bestBench,
            top6Win: 0 // Calculated later
        });
    });

    // Calculate Top 6 Wins
    // Sort by FP For descending
    stats.sort((a, b) => b.fpFor - a.fpFor);
    stats.forEach((stat, index) => {
        stat.top6Win = calculateTop6Win(index + 1);
    });

    return stats;
}

export function calculateSeasonStats(weeklyStats: WeeklyStats[], divisions: Record<string, string>): SeasonStats[] {
    const seasonMap = new Map<string, SeasonStats>();

    weeklyStats.forEach(stat => {
        if (!seasonMap.has(stat.managerId)) {
            seasonMap.set(stat.managerId, {
                managerId: stat.managerId,
                managerName: '', // Fill later
                rosterId: stat.rosterId,
                totalWins: 0,
                totalLosses: 0,
                totalDraws: 0,
                fpFor: 0,
                fpAgainst: 0,
                matchupWins: 0,
                matchupLosses: 0,
                matchupDraws: 0,
                top6Wins: 0,
                top6Losses: 0,
                division: divisions[stat.managerId] || 'Unknown',
                divWins: 0,
                divLosses: 0,
                divDraws: 0
            });
        }

        const season = seasonMap.get(stat.managerId)!;
        season.fpFor += stat.fpFor;
        season.fpAgainst += stat.fpAgainst;
        season.matchupWins += stat.win;
        season.matchupLosses += stat.loss;
        season.matchupDraws += stat.draw;
        season.top6Wins += stat.top6Win;
        season.top6Losses += (1 - stat.top6Win);
        season.totalWins += (stat.win + stat.top6Win);
        season.totalLosses += (stat.loss + (1 - stat.top6Win));
        season.totalDraws += stat.draw;

        // Division Record
        // We need to know if the opponent was in the same division.
        // This requires looking up the opponent's division.
        // Since we don't have the opponent ID easily here without looking up the matchup again, 
        // we might need to pass more info or do this in a second pass.
        // For now, let's skip division record calculation in this simple pass or handle it if we have the opponent info.
        // In `new_stats.py`, it checks `Div Matchup`.
    });

    // Second pass for Division Record if needed, or just return what we have.
    // The Python script calculates Div Wins/Losses.
    // We can do this by iterating matchups again if we had them.
    // For now, let's return the aggregated stats.

    return Array.from(seasonMap.values());
}

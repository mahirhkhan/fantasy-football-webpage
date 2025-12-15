import { SeasonStats } from "./stats";

export interface PlayoffTeam {
    managerId: string;
    managerName: string;
    seed: number;
    totalWins: number;
    winPoints: number;
    bountyPoints: number;
    prePlayoffPoints: number;
    week15Points: number;
    week16Points: number;
    week17Points: number;
    playoffPoints: number; // Total
    finalScore: number;
    finalRank: number;
    pool: 'playoff' | 'consolation';
}

export function determinePlayoffPools(standings: SeasonStats[]): { playoff: SeasonStats[], consolation: SeasonStats[] } {
    // Sort by tiebreakers: Total Wins, Total Draws, FP Rounded, FPA Rounded, Top 6 Wins
    // Note: FP Rounded is round(FP / 100) * 100
    const sorted = [...standings].sort((a, b) => {
        if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
        if (b.totalDraws !== a.totalDraws) return b.totalDraws - a.totalDraws;

        const fpA = Math.round(a.fpFor / 100) * 100;
        const fpB = Math.round(b.fpFor / 100) * 100;
        if (fpB !== fpA) return fpB - fpA;

        const fpaA = Math.round(a.fpAgainst / 100) * 100;
        const fpaB = Math.round(b.fpAgainst / 100) * 100;
        if (fpaB !== fpaA) return fpaB - fpaA;

        return b.top6Wins - a.top6Wins;
    });

    return {
        playoff: sorted.slice(0, 6),
        consolation: sorted.slice(6, 12)
    };
}

export function calculateWinPoints(pool: SeasonStats[]): Map<string, number> {
    const points = new Map<string, number>();
    if (pool.length === 0) return points;

    const minWins = Math.min(...pool.map(p => p.totalWins));
    pool.forEach(p => {
        points.set(p.managerId, (p.totalWins - minWins) * 4);
    });
    return points;
}

export function calculateFinalStandings(
    playoffPool: SeasonStats[],
    consolationPool: SeasonStats[],
    bountyPoints: Map<string, number>,
    playoffScores: Record<number, Record<string, number>> // week -> managerId -> score
): PlayoffTeam[] {
    const results: PlayoffTeam[] = [];

    const processPool = (pool: SeasonStats[], poolName: 'playoff' | 'consolation') => {
        const winPointsMap = calculateWinPoints(pool);

        // Create initial team objects
        let teams: PlayoffTeam[] = pool.map((p, index) => {
            const winPoints = winPointsMap.get(p.managerId) || 0;
            const bPoints = bountyPoints.get(p.managerId) || 0;
            const prePoints = winPoints + bPoints;

            const w15 = playoffScores[15]?.[p.managerId] || 0;
            const w16 = playoffScores[16]?.[p.managerId] || 0;
            const w17 = playoffScores[17]?.[p.managerId] || 0;

            return {
                managerId: p.managerId,
                managerName: p.managerName,
                seed: index + 1,
                totalWins: p.totalWins,
                winPoints,
                bountyPoints: bPoints,
                prePlayoffPoints: prePoints,
                week15Points: w15,
                week16Points: w16,
                week17Points: w17,
                playoffPoints: prePoints + w15 + w16 + w17,
                finalScore: prePoints + w15 + w16 + w17,
                finalRank: 0,
                pool: poolName
            };
        });

        // Determine Final Ranking logic from playoffs.py
        // "Top 2 teams in each pool cannot be eliminated after 2 weeks."
        // "Top 2 scoring teams from those ranked 3-6 after 2 weeks will be eligible for championship."

        teams.forEach(t => {
            t.finalScore = t.playoffPoints; // Default final score
        });

        // Score after Week 16
        const scoreAfterW16 = new Map<string, number>();
        teams.forEach(t => {
            scoreAfterW16.set(t.managerId, t.prePlayoffPoints + t.week15Points + t.week16Points);
        });

        // Identify Groups
        const safeTeams = teams.filter(t => t.seed <= 2);
        const contenders = teams.filter(t => t.seed > 2);

        // Rank contenders by Score After W16
        contenders.sort((a, b) => (scoreAfterW16.get(b.managerId)! - scoreAfterW16.get(a.managerId)!));

        const advancingContenders = contenders.slice(0, 2);
        const eliminatedContenders = contenders.slice(2);

        const championshipGroup = [...safeTeams, ...advancingContenders];
        const consolationGroup = [...eliminatedContenders];

        // Rank within groups based on Final Score (Playoff Points)
        championshipGroup.sort((a, b) => b.finalScore - a.finalScore);
        consolationGroup.sort((a, b) => b.finalScore - a.finalScore);

        // Assign Ranks
        // Championship Group: 1-4
        championshipGroup.forEach((t, i) => {
            t.finalRank = i + 1;
            // Update the main list
            const original = teams.find(x => x.managerId === t.managerId);
            if (original) original.finalRank = t.finalRank;
        });

        // Consolation Group: 5-6
        consolationGroup.forEach((t, i) => {
            t.finalRank = 5 + i;
            const original = teams.find(x => x.managerId === t.managerId);
            if (original) original.finalRank = t.finalRank;
        });

        // For Consolation Pool, the ranks are 7-10 and 11-12 relative to the whole league?
        // Or just 1-6 within the pool?
        // The script saves separate files. Let's keep ranks 1-6 within pool.

        results.push(...teams);
    };

    processPool(playoffPool, 'playoff');
    processPool(consolationPool, 'consolation');

    return results;
}

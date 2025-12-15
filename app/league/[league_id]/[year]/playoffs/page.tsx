import { getLeagueId, getLeagueRosters, getLeagueUsers, getMatchups, getAllPlayers, getRealName, getTransactions, getDrafts, getDraftPicks } from '@/lib/sleeper';
import { calculateWeeklyStats, calculateSeasonStats } from '@/lib/stats';
import { determinePlayoffPools, calculateFinalStandings } from '@/lib/playoffs';
import { notFound } from 'next/navigation';
import Link from 'next/link';

interface PageProps {
    params: Promise<{
        league_id: string;
        year: string;
    }>;
}

export default async function PlayoffsPage({ params }: PageProps) {
    const { league_id, year } = await params;
    const yearNum = parseInt(year);
    const sleeperLeagueId = await getLeagueId(league_id, yearNum);

    if (!sleeperLeagueId) {
        notFound();
    }

    // Fetch Data
    const [users, rosters, players, drafts] = await Promise.all([
        getLeagueUsers(sleeperLeagueId),
        getLeagueRosters(sleeperLeagueId),
        getAllPlayers(),
        getDrafts(sleeperLeagueId)
    ]);

    // Fetch Draft Picks
    const draftId = drafts.find(d => d.season === year)?.draft_id;
    const draftPicks = draftId ? await getDraftPicks(draftId) : [];

    // Regular Season Stats (Weeks 1-14)
    const REG_SEASON_WEEKS = 14;
    const matchupPromises = [];
    const transactionPromises = [];
    for (let w = 1; w <= REG_SEASON_WEEKS; w++) {
        matchupPromises.push(getMatchups(sleeperLeagueId, w).catch(() => []));
        transactionPromises.push(getTransactions(sleeperLeagueId, w).catch(() => []));
    }
    const [regSeasonMatchups, allTransactions] = await Promise.all([
        Promise.all(matchupPromises),
        Promise.all(transactionPromises)
    ]);

    const weeklyStats = [];
    const matchupsMap: Record<number, any[]> = {};

    for (let i = 0; i < regSeasonMatchups.length; i++) {
        const week = i + 1;
        const matchups = regSeasonMatchups[i];
        matchupsMap[week] = matchups || [];
        if (matchups && matchups.length > 0) {
            weeklyStats.push(...calculateWeeklyStats(week, matchups, rosters, users, players));
        }
    }

    const divisions: Record<string, string> = {};
    const seasonStats = calculateSeasonStats(weeklyStats, divisions);

    // Map Manager Names
    const userMap = new Map<string, string>();
    const rosterMap = new Map<number, string>();
    const managerNames = new Map<string, string>();

    users.forEach(u => {
        userMap.set(u.user_id, getRealName(u.display_name));
        managerNames.set(u.user_id, getRealName(u.display_name));
    });
    rosters.forEach(r => rosterMap.set(r.roster_id, r.owner_id));

    seasonStats.forEach(s => {
        const roster = rosters.find(r => r.roster_id === s.rosterId);
        if (roster && roster.owner_id) {
            s.managerName = userMap.get(roster.owner_id) || 'Unknown';
            s.managerId = roster.owner_id;
        }
    });

    // Determine Pools
    const { playoff, consolation } = determinePlayoffPools(seasonStats);

    // Fetch Playoff Scores (Weeks 15-17)
    const playoffWeeks = [15, 16, 17];
    const playoffMatchups = await Promise.all(
        playoffWeeks.map(w => getMatchups(sleeperLeagueId, w).catch(() => []))
    );

    const playoffScores: Record<number, Record<string, number>> = {};

    playoffWeeks.forEach((week, idx) => {
        const matchups = playoffMatchups[idx];
        playoffScores[week] = {};
        if (matchups) {
            // Calculate scores for each manager
            const stats = calculateWeeklyStats(week, matchups, rosters, users, players);
            stats.forEach(s => {
                playoffScores[week][s.managerId] = s.fpFor;
            });
        }
    });

    // Calculate Bounties
    const transactionsMap: Record<number, any[]> = {};
    for (let i = 0; i < allTransactions.length; i++) {
        const week = i + 1;
        transactionsMap[week] = allTransactions[i] || [];
    }

    // Import calculateBounties dynamically or ensure it's imported at top
    const { calculateBounties } = await import('@/lib/bounties');

    const bounties = calculateBounties(
        yearNum,
        league_id,
        weeklyStats,
        transactionsMap,
        matchupsMap,
        players,
        rosterMap,
        managerNames,
        draftPicks
    );

    // Aggregate Bounty Points
    // Rules from bounties.py:
    // Bounty 1: 15 FP
    // Bounty 2: 3 FP per trade (Winner only)
    // Bounty 3: 5 FP (Winner only)
    // Bounty 4: 15 FP
    // Bounty 5: 15 FP
    // Bounty 6: 15 FP
    // Bounty 7: 10 FP + 3 FP per win > 5
    // Bounty 8: 3 FP per perfect lineup (Winner only)
    // Bounty 9: 15 FP
    // Bounty 10: 15 FP

    const bountyPoints = new Map<string, number>();

    bounties.forEach(b => {
        b.winners.forEach(w => {
            bountyPoints.set(w.managerId, (bountyPoints.get(w.managerId) || 0) + w.points);
        });
    });

    const finalStandings = calculateFinalStandings(playoff, consolation, bountyPoints, playoffScores);

    return (
        <div className="min-h-screen bg-gray-900 p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-100">{league_id.toUpperCase()} {year} Playoffs</h1>
                    <div className="space-x-4">
                        <Link href="/" className="text-blue-400 hover:underline hover:text-blue-300">Home</Link>
                        <Link href={`/league/${league_id}/${year}/standings`} className="text-blue-400 hover:underline hover:text-blue-300">Standings</Link>
                        <Link href={`/league/${league_id}/${year}/bounties`} className="text-blue-400 hover:underline hover:text-blue-300">Bounties</Link>
                    </div>
                </div>

                <div className="space-y-12">
                    {/* Playoff Pool */}
                    <section>
                        <h2 className="text-2xl font-bold text-gray-100 mb-4 border-b border-gray-700 pb-2">Championship Bracket</h2>
                        <div className="bg-gray-800 rounded-lg shadow-xl overflow-x-auto border border-gray-700">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-900/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Rank</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Manager</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Seed</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Win Pts</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Bounty Pts</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Pre-Playoff Pts</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">W15</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">W16</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">W17</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {finalStandings.filter(t => t.pool === 'playoff').sort((a, b) => a.finalRank - b.finalRank).map((team) => (
                                        <tr key={team.managerId} className="hover:bg-gray-700/50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-200">{team.finalRank}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-200">{team.managerName}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.seed}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.winPoints.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.bountyPoints.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.prePlayoffPoints.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.week15Points.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.week16Points.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.week17Points.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-400">{team.playoffPoints.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Consolation Pool */}
                    <section>
                        <h2 className="text-2xl font-bold text-gray-100 mb-4 border-b border-gray-700 pb-2">Consolation Bracket</h2>
                        <div className="bg-gray-800 rounded-lg shadow-xl overflow-x-auto border border-gray-700">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-900/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Rank</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Manager</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Seed</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Win Pts</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Bounty Pts</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Pre-Playoff Pts</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">W15</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">W16</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">W17</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {finalStandings.filter(t => t.pool === 'consolation').sort((a, b) => a.finalRank - b.finalRank).map((team) => (
                                        <tr key={team.managerId} className="hover:bg-gray-700/50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-200">{team.finalRank}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-200">{team.managerName}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.seed}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.winPoints.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.bountyPoints.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.prePlayoffPoints.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.week15Points.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.week16Points.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{team.week17Points.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-400">{team.playoffPoints.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

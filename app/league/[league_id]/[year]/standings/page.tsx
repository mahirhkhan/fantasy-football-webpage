import { getLeagueId, getLeagueRosters, getLeagueUsers, getMatchups, getAllPlayers, getRealName } from '@/lib/sleeper';
import { calculateWeeklyStats, calculateSeasonStats } from '@/lib/stats';
import { notFound } from 'next/navigation';
import Link from 'next/link';

interface PageProps {
    params: Promise<{
        league_id: string;
        year: string; // Next.js params are strings
    }>;
}

export default async function StandingsPage({ params }: PageProps) {
    const { league_id, year } = await params;
    const yearNum = parseInt(year);
    const sleeperLeagueId = await getLeagueId(league_id, yearNum);

    if (!sleeperLeagueId) {
        notFound();
    }

    // Fetch Data
    const [users, rosters, players] = await Promise.all([
        getLeagueUsers(sleeperLeagueId),
        getLeagueRosters(sleeperLeagueId),
        getAllPlayers()
    ]);

    // Calculate Stats for all weeks
    // We need to know how many weeks have passed. 
    // For now, let's try to fetch up to 18 weeks and stop when we get no matchups?
    // Or just fetch all 18 and handle errors.
    // Sleeper API returns empty list or error for future weeks? Usually empty list.

    const weeklyStats = [];
    // Determine current week? Or just iterate 1 to 18.
    // Optimization: Fetch in parallel but maybe limit concurrency?
    // Let's fetch 1-14 for regular season as per scripts.
    const REG_SEASON_WEEKS = 14;

    const matchupPromises = [];
    for (let w = 1; w <= REG_SEASON_WEEKS; w++) {
        matchupPromises.push(getMatchups(sleeperLeagueId, w).catch(() => []));
    }
    const allMatchups = await Promise.all(matchupPromises);

    for (let i = 0; i < allMatchups.length; i++) {
        const week = i + 1;
        const matchups = allMatchups[i];
        if (matchups && matchups.length > 0) {
            weeklyStats.push(...calculateWeeklyStats(week, matchups, rosters, users, players));
        }
    }

    // Divisions (Placeholder for now, or infer from somewhere)
    const divisions: Record<string, string> = {};
    // We could try to fetch from the old JSON if we had access, but we are in a web app.
    // Let's leave divisions empty or "Unknown" for now.

    const seasonStats = calculateSeasonStats(weeklyStats, divisions);

    // Sort Standings
    seasonStats.sort((a, b) => {
        if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
        if (b.totalDraws !== a.totalDraws) return b.totalDraws - a.totalDraws;
        if (b.fpFor !== a.fpFor) return b.fpFor - a.fpFor;
        return b.fpAgainst - a.fpAgainst;
    });

    // Map Manager Names
    const userMap = new Map<string, string>();
    users.forEach(u => userMap.set(u.user_id, getRealName(u.display_name)));

    seasonStats.forEach(s => {
        // Roster owner_id might be null if no owner?
        const roster = rosters.find(r => r.roster_id === s.rosterId);
        if (roster && roster.owner_id) {
            s.managerName = userMap.get(roster.owner_id) || 'Unknown';
            s.managerId = roster.owner_id;
        }
    });

    return (
        <div className="min-h-screen bg-gray-900 p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-100">{league_id.toUpperCase()} {year} Standings</h1>
                    <div className="space-x-4">
                        <Link href="/" className="text-blue-400 hover:underline hover:text-blue-300">Home</Link>
                        <Link href={`/league/${league_id}/${year}/bounties`} className="text-blue-400 hover:underline hover:text-blue-300">Bounties</Link>
                        <Link href={`/league/${league_id}/${year}/playoffs`} className="text-blue-400 hover:underline hover:text-blue-300">Playoffs</Link>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-xl overflow-x-auto border border-gray-700">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-900/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Rank</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Manager</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Record (W-L-D)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">FP For</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">FP Against</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Top 6 Wins</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {seasonStats.map((stat, index) => (
                                <tr key={stat.rosterId} className={index < 6 ? "bg-green-900/20" : "hover:bg-gray-700/50"}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{index + 1}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-200">{stat.managerName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                        {stat.totalWins}-{stat.totalLosses}-{stat.totalDraws}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{stat.fpFor.toFixed(2)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{stat.fpAgainst.toFixed(2)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{stat.top6Wins}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

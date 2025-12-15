import { getLeagueId, getLeagueRosters, getLeagueUsers, getMatchups, getAllPlayers, getRealName, getTransactions, getDrafts, getDraftPicks } from '@/lib/sleeper';
import { calculateWeeklyStats } from '@/lib/stats';
import { calculateBounties } from '@/lib/bounties';
import { notFound } from 'next/navigation';
import Link from 'next/link';

interface PageProps {
    params: Promise<{
        league_id: string;
        year: string;
    }>;
}

export default async function BountiesPage({ params }: PageProps) {
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
    // Assuming one draft per season usually
    const draftId = drafts.find(d => d.season === year)?.draft_id;
    const draftPicks = draftId ? await getDraftPicks(draftId) : [];

    const REG_SEASON_WEEKS = 14;

    const matchupPromises = [];
    const transactionPromises = [];
    for (let w = 1; w <= REG_SEASON_WEEKS; w++) {
        matchupPromises.push(getMatchups(sleeperLeagueId, w).catch(() => []));
        transactionPromises.push(getTransactions(sleeperLeagueId, w).catch(() => []));
    }
    const [allMatchups, allTransactions] = await Promise.all([
        Promise.all(matchupPromises),
        Promise.all(transactionPromises)
    ]);

    const weeklyStats = [];
    const matchupsMap: Record<number, any[]> = {};

    for (let i = 0; i < allMatchups.length; i++) {
        const week = i + 1;
        const matchups = allMatchups[i];
        matchupsMap[week] = matchups || [];
        if (matchups && matchups.length > 0) {
            weeklyStats.push(...calculateWeeklyStats(week, matchups, rosters, users, players));
        }
    }

    const transactionsMap: Record<number, any[]> = {};
    for (let i = 0; i < allTransactions.length; i++) {
        const week = i + 1;
        transactionsMap[week] = allTransactions[i] || [];
    }

    const transactions = allTransactions.flat();

    // Maps
    const rosterMap = new Map<number, string>();
    rosters.forEach(r => rosterMap.set(r.roster_id, r.owner_id));

    const managerNames = new Map<string, string>();
    users.forEach(u => managerNames.set(u.user_id, getRealName(u.display_name)));

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

    return (
        <div className="min-h-screen bg-gray-900 p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-100">{league_id.toUpperCase()} {year} Bounties</h1>
                    <div className="space-x-4">
                        <Link href="/" className="text-blue-400 hover:underline hover:text-blue-300">Home</Link>
                        <Link href={`/league/${league_id}/${year}/standings`} className="text-blue-400 hover:underline hover:text-blue-300">Standings</Link>
                        <Link href={`/league/${league_id}/${year}/playoffs`} className="text-blue-400 hover:underline hover:text-blue-300">Playoffs</Link>
                    </div>
                </div>

                <div className="space-y-8">
                    {bounties.map(bounty => (
                        <div key={bounty.id} className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="bg-yellow-900/30 p-3 rounded-full border border-yellow-700/50">
                                    <span className="text-2xl">🏆</span>
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-100">{bounty.title}</h2>
                                    <p className="text-gray-400">{bounty.description}</p>
                                </div>
                            </div>

                            <div className="border-t border-gray-700 pt-4">
                                {bounty.winners.length > 0 ? (
                                    <ul className="space-y-2">
                                        {bounty.winners.map((winner, idx) => (
                                            <li key={idx} className="flex justify-between items-center bg-gray-700/50 p-3 rounded border border-gray-600/50">
                                                <span className="font-medium text-gray-200">{winner.managerName}</span>
                                                <div className="text-right">
                                                    <div className="text-sm text-gray-400 font-mono">{winner.details}</div>
                                                    <div className="text-xs text-green-400 font-bold">+{winner.points} FP</div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-gray-500 italic">No winners yet</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}


import { getLeagueId, getLeagueUsers, getLeagueRosters, getMatchups, getTransactions, getAllPlayers, getRealName, getDrafts, getDraftPicks } from './lib/sleeper';
import { calculateWeeklyStats } from './lib/stats';
import { calculateBounties } from './lib/bounties';

async function main() {
    const league = 'trc';
    const year = 2025;
    console.log(`Debugging ${league.toUpperCase()} ${year}...`);

    const sleeperLeagueId = await getLeagueId(league, year);
    if (!sleeperLeagueId) {
        console.error('League ID not found');
        return;
    }
    console.log(`League ID: ${sleeperLeagueId}`);

    const [users, rosters, players, drafts] = await Promise.all([
        getLeagueUsers(sleeperLeagueId),
        getLeagueRosters(sleeperLeagueId),
        getAllPlayers(),
        getDrafts(sleeperLeagueId)
    ]);

    const draftId = drafts.find(d => d.season === year.toString())?.draft_id;
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
    console.log(`Total Transactions: ${transactions.length}`);

    const rosterMap = new Map<number, string>();
    rosters.forEach(r => rosterMap.set(r.roster_id, r.owner_id));

    const managerNames = new Map<string, string>();
    users.forEach(u => managerNames.set(u.user_id, getRealName(u.display_name)));

    console.log('Calculating Bounties...');
    const bounties = calculateBounties(
        year,
        league,
        weeklyStats,
        transactionsMap,
        matchupsMap,
        players,
        rosterMap,
        managerNames,
        draftPicks
    );

    const b3 = bounties.find(b => b.id === 3);
    console.log('Bounty 3 Winners:', JSON.stringify(b3?.winners, null, 2));

    const b4 = bounties.find(b => b.id === 4);
    console.log('Bounty 4 Winners:', JSON.stringify(b4?.winners, null, 2));
}

main().catch(console.error);

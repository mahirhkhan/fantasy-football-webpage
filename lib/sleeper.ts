export const LEAGUE_IDS: Record<string, Record<number, string>> = {
    bbl: {
        2020: '606956268577447936',
        2021: '650140461830361088',
        2022: '855994274242736128',
        2023: '916955500913225728',
        2024: '1122410215233662976',
        2025: '1254561660018900992',
    },
    trc: {
        2020: '586414421119643648',
        2021: '649913434003042304',
        2022: '855994240486998016',
        2023: '916955581074788352',
        2024: '1122409276741394432',
        2025: '1254561572831895552',
    },
    lol: {
        2024: '1127673083663372288',
        2025: '1254575854462185473',
    },
};

export const USER_MAP: Record<string, string> = {
    'playmehere13': 'Mahir',
    'maroofk29': 'Maroof',
    'Faisalshahid': 'Faisal',
    'Vivek360': 'Vivek',
    'Allenworld': 'Johnny',
    'liujo99': 'Johnny',
    'Nabz24': 'Nabeel',
    'beechert': 'Christina',
    'Fizzle123': 'Arif',
    'abbyhas': 'Abby',
    'arkare': 'Amogh',
    'eskrajeff': 'Jeff',
    'Benchwarmers91': 'Neeloy',
    'TaskForceBitchMob': 'EJ',
    'omahawk': 'Omar',
    'KarniclesOfKarnia': 'Karn',
    'ihsleeper': 'Imran',
    'vudoo6': 'Christian',
    'DeliverUsSaxy': 'Siddhant',
    'dpdp': 'Dillon',
    'dillonpatel': 'Dillon',
    'ontickkhan24': 'Ontick',
    'jpedro': 'Jeremy',
    'Shardz': 'Shardul',
    'saraton1n': 'Sara',
    'rubeansss': 'Rubina',
    'mireyaws': 'Mireya',
    'Nikdev': "Nikhil"
};

export interface SleeperUser {
    user_id: string;
    display_name: string;
    avatar: string;
}

export interface SleeperRoster {
    roster_id: number;
    owner_id: string;
    league_id: string;
    starters: string[];
    players: string[];
    settings: {
        wins: number;
        losses: number;
        ties: number;
        fpts: number;
        fpts_decimal?: number;
        fpts_against?: number;
        fpts_against_decimal?: number;
    };
}

export interface SleeperMatchup {
    matchup_id: number;
    roster_id: number;
    starters: string[];
    players: string[];
    points: number;
    starters_points: number[];
    players_points: Record<string, number>;
}

export interface SleeperDraft {
    draft_id: string;
    season: string;
    status: string;
    settings: {
        rounds: number;
    };
}

export interface SleeperDraftPick {
    pick_no: number;
    round: number;
    player_id: string;
    roster_id: number;
    picked_by: string;
    is_keeper: boolean | null;
}

export interface SleeperTransaction {
    transaction_id: string;
    type: 'trade' | 'free_agent' | 'waiver';
    status: 'complete' | 'failed';
    week: number;
    roster_ids: number[];
    adds: Record<string, number> | null; // player_id: roster_id
    drops: Record<string, number> | null; // player_id: roster_id
    settings: {
        waiver_bid?: number;
    } | null;
    metadata?: {
        player_id?: string;
        notes?: string;
    };
    created: number;
}

export interface SleeperPlayer {
    player_id: string;
    full_name: string;
    first_name: string;
    last_name: string;
    position: string;
    team: string | null;
    active: boolean;
    fantasy_data_id: number | null;
}

export async function getLeagueId(league: string, year: number): Promise<string | null> {
    return LEAGUE_IDS[league]?.[year] || null;
}

export async function getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
    const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
}

export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
    const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
    if (!res.ok) throw new Error('Failed to fetch rosters');
    return res.json();
}

export async function getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
    if (!res.ok) throw new Error('Failed to fetch matchups');
    return res.json();
}

export async function getTransactions(leagueId: string, week: number): Promise<SleeperTransaction[]> {
    const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`);
    if (!res.ok) throw new Error('Failed to fetch transactions');
    return res.json();
}

export async function getDrafts(leagueId: string): Promise<SleeperDraft[]> {
    const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`);
    if (!res.ok) throw new Error('Failed to fetch drafts');
    return res.json();
}

export async function getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
    const res = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
    if (!res.ok) throw new Error('Failed to fetch draft picks');
    return res.json();
}

export async function getAllPlayers(): Promise<Record<string, SleeperPlayer>> {
    // This is a large file (5MB+), we should cache it or fetch it once.
    // For now, we'll fetch it directly. In a real app, we might want to use a local file or KV.
    const res = await fetch('https://api.sleeper.app/v1/players/nfl');
    if (!res.ok) throw new Error('Failed to fetch players');
    return res.json();
}

export function getRealName(username: string): string {
    return USER_MAP[username] || username;
}

export function getFantasyPosition(realPos: string): string {
    if (['DL', 'DE', 'SS', 'DB', 'LB', 'ILB', 'OLB', 'FS', 'S', 'DT', 'CB'].includes(realPos)) {
        return 'IDP';
    } else if (['OT', 'OL', 'K', 'LS', 'P', 'G', 'C'].includes(realPos)) {
        return 'NA';
    } else if (['RB', 'FB', 'HB'].includes(realPos)) {
        return 'RB';
    } else {
        return realPos;
    }
}

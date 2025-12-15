import Link from 'next/link';
import { LEAGUE_IDS } from '@/lib/sleeper';
// Since we didn't install shadcn/ui, I'll use raw Tailwind for now to save time, or create simple components.

export default function Home() {
  const leagues = Object.keys(LEAGUE_IDS).filter(id => id !== 'lol');

  const getLeagueName = (id: string) => {
    if (id === 'bbl') return 'Big Baller League';
    if (id === 'trc') return 'TRCSDATNGGATW';
    return `${id} League`;
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-12 text-gray-100">Commissioner Mahir's Fantasy Football Leagues</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 justify-center">
          {leagues.map(league => {
            const years = Object.keys(LEAGUE_IDS[league])
              .map(Number)
              .filter(y => y >= 2025)
              .sort((a, b) => b - a);

            if (years.length === 0) return null;

            return (
              <div key={league} className="bg-gray-800 rounded-lg shadow-xl overflow-hidden hover:shadow-2xl transition-all border border-gray-700">
                <div className="bg-gradient-to-r from-blue-700 to-blue-900 p-6">
                  <h2 className="text-2xl font-bold text-white text-center tracking-wide">{getLeagueName(league)}</h2>
                </div>
                <div className="p-8">
                  <div className="flex flex-col gap-3">
                    {years.map(year => (
                      <Link
                        key={year}
                        href={`/league/${league}/${year}/standings`}
                        className="block w-full text-center py-3 px-4 bg-gray-700 hover:bg-blue-600 text-gray-200 hover:text-white rounded-md border border-gray-600 hover:border-blue-500 transition-all font-medium"
                      >
                        {year} Season
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

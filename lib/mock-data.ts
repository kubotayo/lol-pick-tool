import { ChampionStatRow, CounterStatRow } from './types';

const DDV = '14.21.1';
const img = (key: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDV}/img/champion/${key}.png`;

export const MOCK_PATCHES = ['14.21', '14.20', '14.19'];

export const MOCK_CHAMPION_STATS: Record<string, ChampionStatRow[]> = {
  TOP: [
    { win_rate: 0.574, games_played: 9821, champions: { champion_id: 58,  champion_name: 'レネクトン', champion_key: 'Renekton',  image_url: img('Renekton')  } },
    { win_rate: 0.561, games_played: 7432, champions: { champion_id: 86,  champion_name: 'ガレン',    champion_key: 'Garen',      image_url: img('Garen')     } },
    { win_rate: 0.553, games_played: 6103, champions: { champion_id: 80,  champion_name: 'パンテオン', champion_key: 'Pantheon',   image_url: img('Pantheon')  } },
    { win_rate: 0.541, games_played: 5214, champions: { champion_id: 54,  champion_name: 'マルファイト', champion_key: 'Malphite',  image_url: img('Malphite')  } },
    { win_rate: 0.538, games_played: 4867, champions: { champion_id: 122, champion_name: 'ダリウス',   champion_key: 'Darius',     image_url: img('Darius')    } },
    { win_rate: 0.531, games_played: 11203, champions: { champion_id: 24, champion_name: 'ジャックス', champion_key: 'Jax',        image_url: img('Jax')       } },
    { win_rate: 0.524, games_played: 8901, champions: { champion_id: 157, champion_name: 'ヤスオ',     champion_key: 'Yasuo',      image_url: img('Yasuo')     } },
    { win_rate: 0.518, games_played: 6230, champions: { champion_id: 39,  champion_name: 'イレリア',   champion_key: 'Irelia',     image_url: img('Irelia')    } },
  ],
  JG: [
    { win_rate: 0.568, games_played: 8102, champions: { champion_id: 11,  champion_name: 'マスター・イー', champion_key: 'MasterYi',   image_url: img('MasterYi')  } },
    { win_rate: 0.554, games_played: 7341, champions: { champion_id: 56,  champion_name: 'ノクターン',    champion_key: 'Nocturne',    image_url: img('Nocturne')  } },
    { win_rate: 0.547, games_played: 9012, champions: { champion_id: 32,  champion_name: 'アムム',        champion_key: 'Amumu',       image_url: img('Amumu')     } },
    { win_rate: 0.539, games_played: 6891, champions: { champion_id: 203, champion_name: 'キンドレッド',  champion_key: 'Kindred',     image_url: img('Kindred')   } },
    { win_rate: 0.527, games_played: 12043, champions: { champion_id: 64, champion_name: 'リー・シン',    champion_key: 'LeeSin',      image_url: img('LeeSin')    } },
    { win_rate: 0.521, games_played: 8234, champions: { champion_id: 19,  champion_name: 'ウォーウィック', champion_key: 'Warwick',     image_url: img('Warwick')   } },
  ],
  MID: [
    { win_rate: 0.571, games_played: 12453, champions: { champion_id: 103, champion_name: 'アーリ',   champion_key: 'Ahri',        image_url: img('Ahri')      } },
    { win_rate: 0.562, games_played: 8221,  champions: { champion_id: 516, champion_name: 'ヴェックス',  champion_key: 'Vex',         image_url: img('Vex')       } },
    { win_rate: 0.558, games_played: 6014,  champions: { champion_id: 131, champion_name: 'ダイアナ', champion_key: 'Diana',       image_url: img('Diana')     } },
    { win_rate: 0.543, games_played: 9310,  champions: { champion_id: 45,  champion_name: 'ベイガー',  champion_key: 'Veigar',      image_url: img('Veigar')    } },
    { win_rate: 0.531, games_played: 18902, champions: { champion_id: 238, champion_name: 'ゼド',     champion_key: 'Zed',         image_url: img('Zed')       } },
    { win_rate: 0.527, games_played: 4211,  champions: { champion_id: 1,   champion_name: 'アニー',   champion_key: 'Annie',       image_url: img('Annie')     } },
    { win_rate: 0.519, games_played: 7893,  champions: { champion_id: 112, champion_name: 'ビクター',  champion_key: 'Viktor',      image_url: img('Viktor')    } },
  ],
  BOT: [
    { win_rate: 0.563, games_played: 10321, champions: { champion_id: 202, champion_name: 'ジン',      champion_key: 'Jhin',        image_url: img('Jhin')      } },
    { win_rate: 0.551, games_played: 8903,  champions: { champion_id: 222, champion_name: 'ジンクス',   champion_key: 'Jinx',        image_url: img('Jinx')      } },
    { win_rate: 0.544, games_played: 7612,  champions: { champion_id: 96,  champion_name: 'コグ＝マウ', champion_key: 'KogMaw',      image_url: img('KogMaw')    } },
    { win_rate: 0.532, games_played: 15023, champions: { champion_id: 22,  champion_name: 'アッシュ',   champion_key: 'Ashe',        image_url: img('Ashe')      } },
    { win_rate: 0.521, games_played: 6781,  champions: { champion_id: 67,  champion_name: 'ヴェイン',   champion_key: 'Vayne',       image_url: img('Vayne')     } },
  ],
  SUP: [
    { win_rate: 0.578, games_played: 9102,  champions: { champion_id: 267, champion_name: 'ナミ',      champion_key: 'Nami',        image_url: img('Nami')      } },
    { win_rate: 0.562, games_played: 7834,  champions: { champion_id: 40,  champion_name: 'ジャンナ',   champion_key: 'Janna',       image_url: img('Janna')     } },
    { win_rate: 0.553, games_played: 11203, champions: { champion_id: 117, champion_name: 'ルル',      champion_key: 'Lulu',        image_url: img('Lulu')      } },
    { win_rate: 0.541, games_played: 8921,  champions: { champion_id: 37,  champion_name: 'ソナ',      champion_key: 'Sona',        image_url: img('Sona')      } },
    { win_rate: 0.528, games_played: 6103,  champions: { champion_id: 25,  champion_name: 'モルガナ',   champion_key: 'Morgana',     image_url: img('Morgana')   } },
  ],
};

// カウンター用：ダリウス(TOP)に対するカウンター
export const MOCK_COUNTER_STATS: Record<string, CounterStatRow[]> = {
  '122_TOP': [
    { win_rate: 0.612, games_played: 3401, champions: { champion_id: 58,  champion_name: 'レネクトン', champion_key: 'Renekton', image_url: img('Renekton') } },
    { win_rate: 0.598, games_played: 1892, champions: { champion_id: 133, champion_name: 'クイン',    champion_key: 'Quinn',    image_url: img('Quinn')    } },
    { win_rate: 0.584, games_played: 2103, champions: { champion_id: 110, champion_name: 'ヴァルス',  champion_key: 'Varus',    image_url: img('Varus')    } },
    { win_rate: 0.561, games_played: 5234, champions: { champion_id: 54,  champion_name: 'マルファイト', champion_key: 'Malphite', image_url: img('Malphite') } },
    { win_rate: 0.547, games_played: 9011, champions: { champion_id: 39,  champion_name: 'イレリア',  champion_key: 'Irelia',   image_url: img('Irelia')   } },
  ],
};

export function getMockCounterKey(championId: number, lane: string): string {
  return `${championId}_${lane}`;
}

// World choice, shared by the lobby (pick where to start) and the results screen (pick where to go next).
// Every pick is a vote; the server starts a world once a majority agrees (see Room.tally).
import { net } from '../net/net';
import { sfx } from '../audio/audio';
import { fmtTime } from './Hud';
import { SLOT_COLORS } from '../shared/constants';
import { MAPS } from '../shared/maps';
import type { LobbyState } from '../shared/protocol';

export interface Rec {
  bestMs: number;
  bestScore: number;
  crowns: number;
}
export type Records = Record<string, Rec> & { adventure?: Rec };

/** This browser's best results per world (`sh_records`). */
export function loadRecords(): Records {
  try {
    return JSON.parse(localStorage.getItem('sh_records') || '{}');
  } catch {
    return {};
  }
}

export function vote(v: string) {
  sfx.play('ui_click');
  net.action('vote', v);
}

/** Coloured dots for the couriers who picked `v`. */
export function Voters({ lobby, v }: { lobby: LobbyState | null; v: string }) {
  return (
    <span className="voters">
      {(lobby?.votes ?? []).map((x, i) => (x === v ? <span key={i} className="vote-dot" style={{ background: SLOT_COLORS[i] }} /> : null))}
    </span>
  );
}

/** Picture of a world (made with `tests/thumbs.ts`). */
const pic = (id: string) => `/assets/worlds/${id}.jpg`;

/** All six worlds (picture + name) plus "all six in a row". */
export function WorldGrid({ lobby, rec, back }: { lobby: LobbyState | null; rec: Records; back?: () => void }) {
  const mine = lobby ? lobby.votes?.[lobby.you] ?? null : null;
  return (
    <div className="map-grid">
      {MAPS.map((m) => {
        const v = `map:${m.index}`;
        const best = rec[m.id];
        return (
          <button key={m.id} className={'map-pick pic' + (mine === v ? ' voted' : '')} title={`${m.name}: ${m.theme}`} onClick={() => vote(v)}>
            <img src={pic(m.id)} alt="" draggable={false} />
            <small className="map-num">{m.sub}</small>
            <span className="map-label">
              <b>{m.name}</b>
              {best && <span className="map-best">{`${'👑'.repeat(best.crowns)} ${fmtTime(best.bestMs)}`}</span>}
            </span>
            <Voters lobby={lobby} v={v} />
          </button>
        );
      })}
      <button className={'map-pick map-all' + (mine === 'adventure' ? ' voted' : '')} onClick={() => vote('adventure')}>
        <span className="map-strip">
          {MAPS.map((m) => (
            <img key={m.id} src={pic(m.id)} alt="" draggable={false} />
          ))}
        </span>
        <b>All six in a row</b>
        <span className="map-best">{rec.adventure ? `best ${rec.adventure.bestScore} pts · ${fmtTime(rec.adventure.bestMs)}` : 'World 1 to 6, one total score'}</span>
        <Voters lobby={lobby} v="adventure" />
      </button>
      {back && (
        <button className="link" onClick={back}>
          back
        </button>
      )}
    </div>
  );
}

/** What the team still needs to do to decide (majority of the team; a split vote is drawn). */
export function voteNote(lobby: LobbyState | null, waitingForTeam = false) {
  if (!lobby) return '';
  const team = lobby.slots.filter(Boolean).length;
  const voted = !!lobby.votes?.[lobby.you];
  if (lobby.tieMs !== undefined) return `Split vote! Drawing one of your picks in ${Math.ceil(lobby.tieMs / 1000)}…`;
  if (waitingForTeam) return voted ? 'Picked! It starts when the team is here and two of you agree' : 'Pick a world while you wait for the team';
  if (team <= 1) return 'Pick what happens next';
  const need = Math.floor(team / 2) + 1;
  return voted ? `Waiting for a teammate to agree (${need} of ${team} decide)…` : `${need === 2 ? 'Two' : need} of you decide`;
}

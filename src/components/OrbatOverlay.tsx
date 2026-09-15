import { useStore } from '../store';
import { UNIT_TYPE_LABELS } from '../natoSymbols';
import { silhouetteFor, silhouetteSvg } from '../silhouettes';
import type { Unit } from '../types';

/** Strip a trailing "-N" so "Operator 1-5" clusters under "Operator 1". */
const baseName = (n: string) => n.replace(/-\d+$/, '');

const deadAt = (u: Unit) => u.destroyedAt !== undefined;

interface Row {
  key: string;
  label: string;
  icon: string;
  total: number;
  alive: number;
  dead: boolean;
  pending: boolean;
}

/**
 * Order-of-battle card flashed up by a camera keyframe: the force structure,
 * grouped by faction and roster entry. Units gray out as they are destroyed;
 * forces not yet on scene sit dimmed.
 */
export default function OrbatOverlay() {
  const scenario = useStore((s) => s.scenario);
  const time = useStore((s) => s.time);
  const roster = useStore((s) => s.unitLibrary);
  const active = [...scenario.keyframes].sort((a, b) => a.time - b.time).filter((k) => k.time <= time).pop();
  const factionIds = new Set(active?.overlayFactionIds ?? []);
  const factions = factionIds.size ? scenario.factions.filter((f) => factionIds.has(f.id)) : scenario.factions;

  const groupName = (u: Unit) =>
    (u.rosterId && roster.find((e) => e.id === u.rosterId)?.name) ||
    UNIT_TYPE_LABELS[u.type] ||
    u.type;

  const isDead = (u: Unit) => deadAt(u) && time >= u.destroyedAt!;
  const isPending = (u: Unit) => time < u.appearAt;

  return (
    <div className="orbat-overlay" aria-hidden>
      <div className="orbat-card">
        <div className="orbat-title">ORDER OF BATTLE</div>
        {factions.map((f) => {
          const units = scenario.units.filter((u) => u.factionId === f.id);
          if (!units.length) return null;
          const alive = units.filter((u) => !isDead(u)).length;
          // roster-entry groups, in first-seen order
          const groups = new Map<string, Unit[]>();
          for (const u of units) {
            const g = groupName(u);
            const arr = groups.get(g);
            if (arr) arr.push(u);
            else groups.set(g, [u]);
          }
          return (
            <section className="orbat-faction" key={f.id}>
              <header className="orbat-fhead">
                <i className="orbat-chip" style={{ background: f.color }} />
                <span>{f.name}</span>
                <em className="orbat-count">
                  {alive} / {units.length}
                </em>
              </header>
              {[...groups].map(([g, us]) => {
                // identical names collapse ("F-15E ×2"); a big group of numbered
                // siblings collapses by its common prefix ("Operator 1" ×12)
                const clusters = new Map<string, Unit[]>();
                for (const u of us) {
                  const b = us.length > 6 ? baseName(u.name) : u.name;
                  const arr = clusters.get(b);
                  if (arr) arr.push(u);
                  else clusters.set(b, [u]);
                }
                const rows: Row[] = [...clusters].map(([label, cu]) => ({
                  key: `${f.id}/${g}/${label}`,
                  label,
                  icon: silhouetteSvg(
                    silhouetteFor(cu[0], roster.find((e) => e.id === cu[0].rosterId)?.name),
                    f.color,
                    cu.every(isDead),
                  ),
                  total: cu.length,
                  alive: cu.filter((u) => !isDead(u)).length,
                  dead: cu.every(isDead),
                  pending: cu.every(isPending),
                }));
                const groupAlive = us.filter((u) => !isDead(u)).length;
                return (
                  <div className="orbat-group" key={g}>
                    <div className="orbat-gname">
                      <span>{g}</span>
                      <em className="orbat-count">{groupAlive} / {us.length}</em>
                    </div>
                    {rows.map((r) => (
                      <div
                        key={r.key}
                        className={`orbat-row ${r.dead ? 'dead' : ''} ${r.pending ? 'pending' : ''}`}
                      >
                        <span
                          className="orbat-ico"
                          dangerouslySetInnerHTML={{ __html: r.icon }}
                        />
                        <span className="orbat-name">{r.label}</span>
                        {r.total > 1 && (
                          <em className="orbat-count">
                            {r.alive} / {r.total}
                          </em>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}

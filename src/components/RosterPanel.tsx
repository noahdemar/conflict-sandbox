import { useRef, useState } from 'react';
import { assetUrl, saveAsset, MAX_ASSET_MB } from '../assets';
import {
  Download,
  Image,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStore } from '../store';
import { UNIT_TYPE_LABELS, unitGlyphSvg } from '../natoSymbols';
import { fetchWikiImage } from '../wiki';
import type { UnitType } from '../types';

const TYPES = Object.keys(UNIT_TYPE_LABELS) as UnitType[];

export default function RosterPanel() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const activeUnitType = useStore((s) => s.activeUnitType);
  const setActiveUnitType = useStore((s) => s.setActiveUnitType);
  const activeRosterId = useStore((s) => s.activeRosterId);
  const setActiveRosterId = useStore((s) => s.setActiveRosterId);
  const unitLibrary = useStore((s) => s.unitLibrary);
  const addRosterEntry = useStore((s) => s.addRosterEntry);
  const removeRosterEntry = useStore((s) => s.removeRosterEntry);
  const updateRosterEntry = useStore((s) => s.updateRosterEntry);
  const importLibrary = useStore((s) => s.importLibrary);
  const exportLibrary = useStore((s) => s.exportLibrary);
  const resetLibrary = useStore((s) => s.resetLibrary);
  const activeFactionId = useStore((s) => s.activeFactionId);
  const factions = useStore((s) => s.scenario.factions);
  const color =
    factions.find((f) => f.id === activeFactionId)?.color ?? '#888';

  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<UnitType>('infantry');
  const [newFaction, setNewFaction] = useState('');
  const [newModelUrl, setNewModelUrl] = useState('');
  const [newModelYaw, setNewModelYaw] = useState('');
  const [newRange, setNewRange] = useState('');
  const [newImage, setNewImage] = useState<{
    imageUrl: string;
    wikiTitle: string;
  } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [newIcon, setNewIcon] = useState<string | undefined>();
  const [newModelAsset, setNewModelAsset] = useState<{ ref: string; name: string } | undefined>();
  /** Roster entry waiting for an uploaded icon, if the upload came from a row. */
  const [iconTarget, setIconTarget] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);

  if (tool !== 'unit') return null;

  const filtered = unitLibrary.filter(
    (e) =>
      !query ||
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      UNIT_TYPE_LABELS[e.type].toLowerCase().includes(query.toLowerCase()),
  );

  const pickRoster = (id: string) => {
    setActiveRosterId(id);
    setTool('unit');
  };

  const pickBasic = (t: UnitType) => {
    setActiveRosterId(null);
    setActiveUnitType(t);
    setTool('unit');
  };

  const doExport = () => {
    const blob = new Blob([exportLibrary()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unit-library.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Store an uploaded file, reporting anything the browser refuses. */
  const upload = async (file: File, kind: 'icon' | 'model') => {
    try {
      return await saveAsset(file, kind);
    } catch (err) {
      alert(`Could not add that file. ${(err as Error).message}`);
      return undefined;
    }
  };

  const submitNew = () => {
    if (!newName.trim()) return;
    addRosterEntry({
      name: newName.trim(),
      type: newType,
      faction: newFaction.trim() || undefined,
      modelUrl: newModelUrl.trim() || undefined,
      modelYaw: newModelYaw.trim() ? Number(newModelYaw) : undefined,
      rangeKm: newRange.trim() ? Number(newRange) : undefined,
      imageUrl: newImage?.imageUrl,
      wikiTitle: newImage?.wikiTitle,
      iconImage: newIcon,
      ...(newModelAsset ? { modelUrl: newModelAsset.ref } : {}),
    });
    setNewName('');
    setNewFaction('');
    setNewModelUrl('');
    setNewModelYaw('');
    setNewRange('');
    setNewImage(null);
    setNewIcon(undefined);
    setNewModelAsset(undefined);
    setAdding(false);
  };

  const fetchImage = async (name: string, apply: typeof setNewImage) => {
    if (!name.trim() || fetching) return;
    setFetching(true);
    apply(await fetchWikiImage(name.trim()));
    setFetching(false);
  };

  return (
    <div className="panel roster-panel">
      <div className="panel-title">
        Roster
        <span className="roster-actions">
          <button
            className="icon-btn"
            title="Add roster entry"
            onClick={() => setAdding(!adding)}
          >
            <Plus size={14} />
          </button>
          <button
            className="icon-btn"
            title="Import unit library (JSON)"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={13} />
          </button>
          <button
            className="icon-btn"
            title="Export unit library (JSON)"
            onClick={doExport}
          >
            <Download size={13} />
          </button>
          <button
            className="icon-btn"
            title="Reset to default library"
            onClick={resetLibrary}
          >
            <RotateCcw size={13} />
          </button>
        </span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            f.text().then((t) => {
              if (!importLibrary(t))
                alert('Could not import: invalid unit library file.');
            });
          e.target.value = '';
        }}
      />

      <input
        ref={iconRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        style={{ display: 'none' }}
        onChange={async (ev) => {
          const f = ev.target.files?.[0];
          ev.target.value = '';
          if (!f) return;
          const ref = await upload(f, 'icon');
          if (!ref) return;
          if (iconTarget) updateRosterEntry(iconTarget, { iconImage: ref });
          else setNewIcon(ref);
          setIconTarget(null);
        }}
      />
      <input
        ref={modelRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        style={{ display: 'none' }}
        onChange={async (ev) => {
          const f = ev.target.files?.[0];
          ev.target.value = '';
          if (!f) return;
          const ref = await upload(f, 'model');
          if (ref) setNewModelAsset({ ref, name: f.name });
        }}
      />

      {adding && (
        <div className="roster-add">
          <input
            placeholder="Unit name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNew()}
          />
          <div className="roster-add-row">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as UnitType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {UNIT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <input
              placeholder="Faction (opt.)"
              value={newFaction}
              onChange={(e) => setNewFaction(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitNew()}
            />
          </div>
          <div className="roster-add-row">
            <button className="roster-add-submit" onClick={() => { setIconTarget(null); iconRef.current?.click(); }}>
              <Upload size={12} /> {newIcon ? 'Icon added' : 'Upload icon'}
            </button>
            {newIcon && <img className="roster-img-preview" src={assetUrl(newIcon)} alt="" />}
            <button className="roster-add-submit" onClick={() => modelRef.current?.click()}>
              <Upload size={12} /> {newModelAsset ? '3D model added' : 'Upload 3D model'}
            </button>
          </div>
          {newModelAsset && <div className="roster-note">{newModelAsset.name}</div>}
          <input
            placeholder="3D model URL (.glb, opt.)"
            value={newModelUrl}
            onChange={(e) => setNewModelUrl(e.target.value)}
          />
          {(newModelUrl.trim() || newModelAsset) && (
            <input
              placeholder="Model yaw offset ° (opt.)"
              value={newModelYaw}
              onChange={(e) => setNewModelYaw(e.target.value)}
            />
          )}
          <input
            placeholder="Range ring km (opt.)"
            value={newRange}
            onChange={(e) => setNewRange(e.target.value)}
          />
          <div className="roster-add-row">
            <button
              className="roster-add-submit"
              disabled={fetching || !newName.trim()}
              onClick={() => fetchImage(newName, setNewImage)}
            >
              {fetching ? 'Fetching…' : 'Wikipedia image'}
            </button>
            {newImage && (
              <img
                className="roster-img-preview"
                src={newImage.imageUrl}
                title={newImage.wikiTitle}
                alt=""
              />
            )}
          </div>
          <button className="roster-add-submit" onClick={submitNew}>
            Add to roster
          </button>
          <div className="roster-note">
            Uploads stay in this browser (icons up to {MAX_ASSET_MB.icon} MB, models up to {MAX_ASSET_MB.model} MB). They are not
            included in share links or exported scenarios.
          </div>
        </div>
      )}

      <input
        className="roster-search"
        placeholder="Search roster…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="roster-list">
        {filtered.map((e) => (
          <div
            key={e.id}
            className={`roster-row ${activeRosterId === e.id ? 'active' : ''}`}
            onClick={() => pickRoster(e.id)}
            title={`${UNIT_TYPE_LABELS[e.type]}${e.faction ? `, ${e.faction}` : ''}${e.modelUrl ? ', custom 3D model' : ''}`}
          >
            {e.iconImage ? (
              <span className="unit-glyph custom">
                <img src={assetUrl(e.iconImage)} alt="" />
              </span>
            ) : (
              <span
                className="unit-glyph"
                style={{ background: color }}
                dangerouslySetInnerHTML={{ __html: unitGlyphSvg(e.type) }}
              />
            )}
            <span className="roster-name">{e.name}</span>
            <button
              className="icon-btn"
              title={e.iconImage ? 'Replace uploaded icon' : 'Upload a custom icon'}
              onClick={(ev) => {
                ev.stopPropagation();
                setIconTarget(e.id);
                iconRef.current?.click();
              }}
            >
              <Upload size={12} />
            </button>
            <button
              className="icon-btn"
              title="Fetch Wikipedia image"
              disabled={fetching}
              onClick={(ev) => {
                ev.stopPropagation();
                void fetchWikiImage(e.name).then(
                  (img) => img && updateRosterEntry(e.id, img),
                );
              }}
            >
              <Image size={12} />
            </button>
            <button
              className="icon-btn danger roster-del"
              title="Remove from roster"
              onClick={(ev) => {
                ev.stopPropagation();
                removeRosterEntry(e.id);
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="roster-empty">No matching units</div>
        )}
      </div>

      <div className="panel-title">Basic units</div>
      <div className="roster-basic">
        {TYPES.map((t) => (
          <button
            key={t}
            className={`unit-type-btn ${
              !activeRosterId && activeUnitType === t ? 'active' : ''
            }`}
            onClick={() => pickBasic(t)}
          >
            <span
              className="unit-glyph"
              style={{ background: color }}
              dangerouslySetInnerHTML={{ __html: unitGlyphSvg(t) }}
            />
            <span>{UNIT_TYPE_LABELS[t]}</span>
          </button>
        ))}
      </div>
      <div className="roster-hint">Click map to place</div>
    </div>
  );
}

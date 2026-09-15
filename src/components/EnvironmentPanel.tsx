import { useStore, DEFAULT_ENVIRONMENT } from '../store';

/** Time of day, wind, haze, clouds and precipitation for the scenario. */
export default function EnvironmentPanel() {
  const env = useStore((s) => s.scenario.environment) ?? DEFAULT_ENVIRONMENT;
  const update = useStore((s) => s.updateEnvironment);

  const field = (label: string, value: number, onChange: (v: number) => void, min: number, max: number, step: number) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </label>
  );

  return (
    <div className="panel env-panel">
      <div className="panel-title">Environment</div>
      {field('Start hour', env.startHour, (v) => update({ startHour: v }), 0, 24, 0.25)}
      {field('End hour', env.endHour, (v) => update({ endHour: v }), 0, 24, 0.25)}
      {field('Wind toward (°)', env.windDirDeg, (v) => update({ windDirDeg: v }), 0, 360, 15)}
      {field('Wind (km/h)', env.windKph, (v) => update({ windKph: v }), 0, 80, 5)}
      {field('Haze', env.haze, (v) => update({ haze: v }), 0, 1, 0.1)}
      {field('Cloud cover', env.cloudCover ?? 0, (v) => update({ cloudCover: v }), 0, 1, 0.1)}
      <label className="field">
        <span>Weather</span>
        <select
          value={env.precipitation ?? 'none'}
          onChange={(e) => update({ precipitation: e.target.value as NonNullable<typeof env.precipitation> })}
        >
          <option value="none">Clear</option>
          <option value="rain">Rain</option>
          <option value="snow">Snow</option>
          <option value="dust">Blowing dust</option>
        </select>
      </label>
      {(env.precipitation ?? 'none') !== 'none' &&
        field('Intensity', env.precipIntensity ?? 0.5, (v) => update({ precipIntensity: v }), 0, 1, 0.1)}
    </div>
  );
}

import { useStore, DEFAULT_ENVIRONMENT } from '../store';

/** Time of day, wind and haze for the scenario. */
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
    </div>
  );
}

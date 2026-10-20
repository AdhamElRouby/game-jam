import { SHAPES } from '../shared/shapes';

export function ShapeIcon({ shape, size = 40, label = false, active = false }: { shape: number; size?: number; label?: boolean; active?: boolean }) {
  const s = size;
  const fill = '#ffd153';
  const stroke = '#b07a22';
  let el;
  if (shape === 0) el = <rect x={s * 0.22} y={s * 0.22} width={s * 0.56} height={s * 0.56} rx={s * 0.08} fill={fill} stroke={stroke} strokeWidth={3} />;
  else if (shape === 1) el = <rect x={s * 0.06} y={s * 0.4} width={s * 0.88} height={s * 0.2} rx={s * 0.05} fill={fill} stroke={stroke} strokeWidth={3} />;
  else if (shape === 2) el = <rect x={s * 0.38} y={s * 0.06} width={s * 0.24} height={s * 0.88} rx={s * 0.05} fill={fill} stroke={stroke} strokeWidth={3} />;
  else el = <circle cx={s / 2} cy={s / 2} r={s * 0.3} fill={fill} stroke={stroke} strokeWidth={3} />;
  return (
    <div className={'shape-icon' + (active ? ' active' : '')}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
        {el}
      </svg>
      {label && <div className="shape-name">{SHAPES[shape].name}</div>}
    </div>
  );
}

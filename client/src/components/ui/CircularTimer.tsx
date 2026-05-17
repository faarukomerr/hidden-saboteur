import { motion } from 'framer-motion';

interface Props {
    timeLeft: number;
    total: number;
}

export const CircularTimer = ({ timeLeft, total }: Props) => {
    const size = 84;
    const sw = 5.5;
    const r = (size - sw * 2) / 2;
    const circ = 2 * Math.PI * r;
    const pct = total > 0 ? Math.max(0, timeLeft / total) : 1;
    const offset = circ * (1 - pct);

    const urgent = timeLeft <= 10;
    const warn = timeLeft <= 30;
    const color = urgent ? '#FF0055' : warn ? '#F59E0B' : '#00F0FF';
    const shadow = urgent ? 'rgba(255,0,85,0.85)' : warn ? 'rgba(245,158,11,0.75)' : 'rgba(0,240,255,0.75)';

    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    const label = m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}`;

    return (
        <motion.div
            className="relative flex items-center justify-center"
            style={{ width: size, height: size }}
            animate={urgent ? { scale: [1, 1.09, 1] } : { scale: 1 }}
            transition={{ duration: 0.45, repeat: urgent ? Infinity : 0 }}
        >
            <svg
                width={size} height={size}
                className="absolute inset-0"
                style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 8px ${shadow})` }}
            >
                <circle cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={sw} />
                <motion.circle
                    cx={size / 2} cy={size / 2} r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={sw}
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1, ease: 'linear' }}
                />
            </svg>
            <motion.span
                className="relative font-black font-mono tabular-nums z-10 leading-none"
                style={{ color, fontSize: m > 0 ? '1rem' : '1.3rem' }}
                animate={urgent ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
                transition={{ duration: 0.45, repeat: urgent ? Infinity : 0 }}
            >
                {label}
            </motion.span>
        </motion.div>
    );
};

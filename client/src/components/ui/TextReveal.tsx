import React from 'react';
import { motion } from 'framer-motion';

interface TextRevealProps {
    text: string;
    className?: string;
    delay?: number;
}

export const TextReveal: React.FC<TextRevealProps> = ({ text, className = "", delay = 0 }) => {
    // Split the text into an array of characters
    const characters = text.split("");

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: (i = 1) => ({
            opacity: 1,
            transition: { staggerChildren: 0.05, delayChildren: delay * i },
        }),
    };

    const childVariants = {
        hidden: { opacity: 0, y: 40, scale: 0.8 },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: {
                type: "spring",
                damping: 12,
                stiffness: 100,
            },
        },
    };

    return (
        <motion.div
            style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center" }}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className={className}
        >
            {characters.map((char, index) => (
                <motion.span
                    variants={childVariants}
                    key={index}
                    style={{ whiteSpace: "pre" }}
                    className="inline-block"
                >
                    {char}
                </motion.span>
            ))}
        </motion.div>
    );
};

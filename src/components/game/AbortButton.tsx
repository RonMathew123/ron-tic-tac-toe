import { motion } from "framer-motion";
import { NeonButton } from "./NeonButton";
import { X } from "lucide-react";

export function AbortButton({ onAbort }: { onAbort: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-4 right-4 z-50"
    >
      <NeonButton variant="magenta" onClick={onAbort} className="!py-2 !px-4 flex items-center gap-2">
        <X className="w-4 h-4" /> Abort Match
      </NeonButton>
    </motion.div>
  );
}

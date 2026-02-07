"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

export interface User {
  id: string;
  name: string;
  status: "selecting" | "paid" | "active";
  itemCount?: number;
  is_virtual?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-rose-500",
    "bg-pink-500",
    "bg-fuchsia-500",
    "bg-purple-500",
    "bg-violet-500",
    "bg-indigo-500",
    "bg-blue-500",
    "bg-cyan-500",
    "bg-teal-500",
    "bg-emerald-500",
    "bg-green-500",
    "bg-lime-500",
    "bg-amber-500",
    "bg-orange-500",
  ];
  const index = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length];
}

interface UserAvatarProps {
  user: User;
  index: number;
}

function UserAvatar({ user, index }: UserAvatarProps) {
  const isPaid = user.status === "paid";
  const isSelecting = user.status === "selecting";
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 30,
        delay: index * 0.05,
      }}
      className="relative flex flex-col items-center gap-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover Tooltip - Full Name */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.9 }}
            className="absolute -top-10 z-50 px-3 py-1.5 rounded-lg bg-foreground text-background text-sm font-bold whitespace-nowrap shadow-xl"
          >
            {user.name}
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-foreground" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar Circle */}
      <motion.div
        animate={{ scale: isHovered ? 1.25 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={cn(
          "relative w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg cursor-pointer",
          getAvatarColor(user.name),
          isPaid &&
            "ring-2 ring-emerald-400 ring-offset-2 ring-offset-background",
          isHovered && "z-10 shadow-2xl"
        )}
      >
        {getInitials(user.name)}

        {/* Status Badge */}
        <AnimatePresence>
          {isPaid && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm border-2 border-background"
            >
              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            </motion.div>
          )}
          {isSelecting && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center shadow-sm border-2 border-background"
            >
              <CreditCard className="w-2 h-2 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Name Label - Animated on hover */}
      <motion.span
        initial={{ opacity: 0, y: -5 }}
        animate={{ 
          opacity: 1, 
          y: 0, 
          scale: isHovered ? 1.15 : 1,
          fontWeight: isHovered ? 700 : 600
        }}
        transition={{ delay: index * 0.05 + 0.1 }}
        className={cn(
          "text-[9px] truncate max-w-[50px] text-center transition-all",
          isPaid
            ? "text-emerald-600"
            : isSelecting
              ? "text-amber-600"
              : "text-muted-foreground",
          isHovered && "text-[11px] max-w-[70px]"
        )}
      >
        {user.name.split(" ")[0]}
      </motion.span>
    </motion.div>
  );
}

interface UserAvatarsProps {
  users: User[];
  maxVisible?: number;
  className?: string;
}

export function UserAvatars({
  users,
  maxVisible = 6,
  className,
}: UserAvatarsProps) {
  const visibleUsers = users.slice(0, maxVisible);
  const remainingCount = Math.max(0, users.length - maxVisible);

  if (users.length === 0) return null;

  return (
    <div className={cn("flex items-start gap-2 flex-wrap", className)}>
      <AnimatePresence mode="popLayout">
        {visibleUsers.map((user, index) => (
          <UserAvatar key={user.id} user={user} index={index} />
        ))}

        {remainingCount > 0 && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground border-2 border-dashed border-muted-foreground/30"
          >
            +{remainingCount}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default UserAvatars;

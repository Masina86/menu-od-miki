import React, { type PropsWithChildren } from "react";

type MotionProps = {
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  transition?: unknown;
  variants?: unknown;
  className?: string;
  [key: string]: unknown;
};

function element(tag: keyof React.JSX.IntrinsicElements) {
  return function MotionCompatibleElement({
    initial: _initial,
    animate: _animate,
    exit: _exit,
    transition: _transition,
    variants: _variants,
    className,
    ...props
  }: MotionProps) {
    return React.createElement(tag, {
      ...props,
      className: ["menu-motion", className].filter(Boolean).join(" "),
    });
  };
}

export const motion = {
  button: element("button"),
  div: element("div"),
  h1: element("h1"),
  img: element("img"),
  p: element("p"),
  section: element("section"),
};

export function AnimatePresence({
  children,
}: PropsWithChildren<{ mode?: string; initial?: boolean }>) {
  return <>{children}</>;
}

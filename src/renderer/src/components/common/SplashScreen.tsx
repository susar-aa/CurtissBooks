import React, { useEffect, useRef } from 'react';
import lottie, { AnimationItem } from 'lottie-web';
import animationData from '../../assets/logo/Curtiss Books SWRDB Animation.json';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Load Lottie Animation
    const anim = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: animationData,
    });
    animRef.current = anim;

    let holdTimer: NodeJS.Timeout | null = null;

    anim.addEventListener('complete', () => {
      // Keep for 3 seconds after the animation finishes, then navigate to login
      holdTimer = setTimeout(() => {
        onComplete();
      }, 3000);
    });

    // Safety fallback: if complete event doesn't fire within 15 seconds, proceed
    const safetyTimer = setTimeout(() => {
      onComplete();
    }, 15000);

    return () => {
      if (holdTimer) clearTimeout(holdTimer);
      clearTimeout(safetyTimer);
      anim.destroy();
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-white p-8 select-none font-sans">
      <div className="w-full h-8" />

      <div className="w-full max-w-2xl px-6 flex flex-col items-center justify-center my-auto">
        <div ref={containerRef} className="w-full h-64 sm:h-80 flex items-center justify-center" />
      </div>

      <div className="w-full text-center pb-4 text-xs font-normal text-zinc-500 tracking-wide">
        Developped By Curtiss . <span className="font-semibold text-zinc-700">www.trycurtiss.com</span>
      </div>
    </div>
  );
};

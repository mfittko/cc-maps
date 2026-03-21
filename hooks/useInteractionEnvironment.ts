import { useEffect, useState } from 'react';

function isLegacyMediaQueryList(mediaQuery) {
  return typeof mediaQuery.addEventListener !== 'function';
}

export function useInteractionEnvironment() {
  const [isMacOS, setIsMacOS] = useState(false);
  const [isMobileInteraction, setIsMobileInteraction] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return undefined;
    }

    const mobileMediaQuery = window.matchMedia('(max-width: 640px)');
    const coarsePointerMediaQuery = window.matchMedia('(pointer: coarse)');
    const updateInteractionEnvironment = () => {
      setIsMacOS(/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent));
      setIsMobileInteraction(
        mobileMediaQuery.matches ||
          coarsePointerMediaQuery.matches ||
          Number(navigator.maxTouchPoints) > 0
      );
    };

    updateInteractionEnvironment();

    const addListener = (mediaQuery: MediaQueryList) => {
      if (!isLegacyMediaQueryList(mediaQuery)) {
        mediaQuery.addEventListener('change', updateInteractionEnvironment);
        return () => mediaQuery.removeEventListener('change', updateInteractionEnvironment);
      }

      mediaQuery.addListener(updateInteractionEnvironment);
      return () => mediaQuery.removeListener(updateInteractionEnvironment);
    };

    const removeMobileListener = addListener(mobileMediaQuery);
    const removeCoarseListener = addListener(coarsePointerMediaQuery);
    window.addEventListener('resize', updateInteractionEnvironment);

    return () => {
      removeMobileListener();
      removeCoarseListener();
      window.removeEventListener('resize', updateInteractionEnvironment);
    };
  }, []);

  return { isMacOS, isMobileInteraction };
}
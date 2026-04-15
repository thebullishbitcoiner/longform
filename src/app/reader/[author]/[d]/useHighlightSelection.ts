import { useCallback, useEffect, useState } from 'react';

interface HighlightButtonPosition {
  top: number;
  left: number;
}

interface UseHighlightSelectionParams {
  postContentRef: React.RefObject<HTMLDivElement | null>;
}

export function useHighlightSelection({ postContentRef }: UseHighlightSelectionParams) {
  const [selectedText, setSelectedText] = useState('');
  const [showHighlightButton, setShowHighlightButton] = useState(false);
  const [highlightButtonPosition, setHighlightButtonPosition] = useState<HighlightButtonPosition>({
    top: 0,
    left: 0,
  });

  const updateHighlightButtonPosition = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    if (!postContentRef.current || !postContentRef.current.contains(range.commonAncestorContainer)) return;

    const rect = range.getBoundingClientRect();
    setHighlightButtonPosition({
      top: rect.bottom + 10,
      left: rect.left + rect.width / 2,
    });
  }, [postContentRef]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();

      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setShowHighlightButton(false);
        setSelectedText('');
        return;
      }

      const range = selection.getRangeAt(0);
      if (!postContentRef.current || !postContentRef.current.contains(range.commonAncestorContainer)) {
        setShowHighlightButton(false);
        setSelectedText('');
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        setShowHighlightButton(false);
        setSelectedText('');
        return;
      }

      setSelectedText(text);
      updateHighlightButtonPosition();
      setShowHighlightButton(true);
    };

    const handleScroll = () => {
      if (showHighlightButton) {
        updateHighlightButtonPosition();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [postContentRef, showHighlightButton, updateHighlightButtonPosition]);

  const clearHighlightSelection = useCallback(() => {
    setShowHighlightButton(false);
    setSelectedText('');
  }, []);

  return {
    selectedText,
    showHighlightButton,
    highlightButtonPosition,
    clearHighlightSelection,
  };
}

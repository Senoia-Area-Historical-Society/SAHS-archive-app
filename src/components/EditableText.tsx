import React, { useState, useEffect, useRef } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';
import { Pencil } from 'lucide-react';

interface EditableTextProps {
    textKey: string;
    defaultText: string;
    multiline?: boolean;
    className?: string;
    containerType?: 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p';
}

export function EditableText({
    textKey,
    defaultText,
    multiline = false,
    className = '',
    containerType = 'span'
}: EditableTextProps) {
    const { settings, isAppearanceEditMode, updateContentBlock } = useAppearance();
    const [isEditing, setIsEditing] = useState(false);
    const [val, setVal] = useState(settings.contentBlocks?.[textKey] || defaultText);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    // Sync from settings changes
    useEffect(() => {
        if (settings.contentBlocks?.[textKey] !== undefined) {
            setVal(settings.contentBlocks[textKey]);
        }
    }, [settings.contentBlocks, textKey]);

    const handleStartEdit = () => {
        setIsEditing(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleSave = async () => {
        setIsEditing(false);
        const trimmed = val.trim();
        if (!trimmed || trimmed === (settings.contentBlocks?.[textKey] || defaultText)) return;
        await updateContentBlock(textKey, trimmed);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !multiline) {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsEditing(false);
            setVal(settings.contentBlocks?.[textKey] || defaultText);
        }
    };

    if (isEditing) {
        if (multiline) {
            return (
                <div className="w-full font-sans flex flex-col gap-2">
                    <textarea
                        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full px-3 py-2 text-charcoal bg-white border-2 border-tan rounded-xl outline-none shadow-sm focus:ring-1 focus:ring-tan min-h-[120px] text-sm text-left leading-relaxed font-sans font-medium"
                    />
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-[10px] text-charcoal/40 font-bold uppercase tracking-wider">
                            Press ESC to Cancel
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditing(false);
                                    setVal(settings.contentBlocks?.[textKey] || defaultText);
                                }}
                                className="px-3.5 py-1.5 text-xs font-bold border-2 border-tan/35 text-charcoal/70 hover:bg-tan/5 hover:border-tan/50 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                className="px-4.5 py-1.5 text-xs font-bold bg-tan hover:bg-tan-dark text-white rounded-xl shadow-md active:scale-95 transition-all"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return (
            <div className="w-full font-sans flex items-center gap-2">
                <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 px-3 py-1.5 text-charcoal bg-white border-2 border-tan rounded-xl outline-none shadow-sm focus:ring-1 focus:ring-tan text-sm leading-snug font-sans font-medium"
                />
                <button
                    type="button"
                    onClick={() => {
                        setIsEditing(false);
                        setVal(settings.contentBlocks?.[textKey] || defaultText);
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold border-2 border-tan/35 text-charcoal/70 hover:bg-tan/5 hover:border-tan/50 rounded-xl transition-all shrink-0"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    className="px-4.5 py-1.5 text-xs font-bold bg-tan hover:bg-tan-dark text-white rounded-xl shadow-md active:scale-95 transition-all shrink-0"
                >
                    Save
                </button>
            </div>
        );
    }

    const rawValue = settings.contentBlocks?.[textKey];
    const displayText = (rawValue && String(rawValue).trim()) ? String(rawValue) : defaultText;
    const Container = containerType;

    if (!isAppearanceEditMode) {
        return (
            <Container className={className}>
                {multiline ? (
                    displayText.split('\n').map((line, idx) => (
                        <React.Fragment key={idx}>
                            {line}
                            {idx < displayText.split('\n').length - 1 && <br />}
                        </React.Fragment>
                    ))
                ) : (
                    displayText
                )}
            </Container>
        );
    }

    return (
        <Container 
            onClick={handleStartEdit}
            className={`${className} border border-dashed border-tan/30 hover:border-tan/80 hover:bg-tan/5 rounded-lg cursor-pointer p-1.5 transition-all duration-150 inline-block relative group/edit-block min-w-[50px]`}
            title="Click to edit text"
        >
            {multiline ? (
                displayText.split('\n').map((line, idx) => (
                    <React.Fragment key={idx}>
                        {line}
                        {idx < displayText.split('\n').length - 1 && <br />}
                    </React.Fragment>
                ))
            ) : (
                displayText
            )}
            <span className="absolute -top-2.5 -right-2.5 bg-tan text-white rounded-full p-1 shadow-md opacity-0 group-hover/edit-block:opacity-100 transition-opacity z-20 shrink-0">
                <Pencil size={10} strokeWidth={2.5} />
            </span>
        </Container>
    );
}

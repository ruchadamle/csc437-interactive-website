import React, { useEffect, useMemo, useRef, useState } from "react";

export default function PokemonCard({
  pokemonName,
  typeLabel,
  dexNumber,
  imageSrc,
  options, // expects [{ key, name, dex, imageSrc }]
  value,
  onChange,
  onGenerate,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [hadEdit, setHadEdit] = useState(false);
  const blurTimeout = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef(new Map());

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.dex - b.dex),
    [options],
  );

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) {
      return sorted;
    }

    return sorted.filter(
      (option) =>
        option.name.toLowerCase().includes(q)
        || String(option.dex).includes(q.replace("#", "")),
    );
  }, [draft, sorted]);

  const selectedKey = useMemo(() => {
    const normalizedValue = value.trim().toLowerCase();
    return sorted.find((option) => option.name.toLowerCase() === normalizedValue)?.key ?? null;
  }, [sorted, value]);

  useEffect(() => {
    if (!isOpen || !selectedKey) {
      return;
    }

    const menu = menuRef.current;
    const selectedNode = optionRefs.current.get(selectedKey);
    if (!menu || !selectedNode) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const targetTop = selectedNode.offsetTop - (menu.clientHeight / 2) + (selectedNode.clientHeight / 2);
      menu.scrollTop = Math.max(0, targetTop);
    });

    return () => cancelAnimationFrame(frameId);
  }, [isOpen, selectedKey]);

  function openAndClear() {
    setIsOpen(true);
    setDraft("");
    setHadEdit(false);
  }

  function restoreIfUnchanged() {
    if (!hadEdit || draft.trim() === "") {
      setDraft(value);
    }
    setIsOpen(false);
  }

  return (
    <article className="panel pokemon-card">
      <div className="pokemon-card-inner">
        <h2 className="pokemon-title">{pokemonName}</h2>

        <img
          className="pokemon-image"
          src={imageSrc}
          alt={`${pokemonName} sprite`}
        />

        <p className="pokemon-meta muted">
          {typeLabel} - {dexNumber}
        </p>

        <hr className="pokemon-divider" />

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            onGenerate?.();
          }}
        >
          <label htmlFor="pokemon-search">Search Pokemon</label>

          <div className="combo">
            <input
              id="pokemon-search"
              name="pokemon"
              type="text"
              className="fat-input"
              placeholder="Start typing..."
              value={draft}
              onFocus={() => {
                if (blurTimeout.current) {
                  clearTimeout(blurTimeout.current);
                }
                openAndClear();
              }}
              onBlur={() => {
                blurTimeout.current = setTimeout(
                  () => restoreIfUnchanged(),
                  120,
                );
              }}
              onChange={(event) => {
                setDraft(event.target.value);
                setHadEdit(true);
                setIsOpen(true);
              }}
              aria-autocomplete="list"
              aria-expanded={isOpen}
              autoComplete="off"
            />

            {isOpen && (
              <div
                ref={menuRef}
                className="combo-menu"
                role="listbox"
                aria-label="Pokemon options"
              >
                {filtered.map((option) => (
                  <button
                    key={option.key}
                    ref={(node) => {
                      if (node) {
                        optionRefs.current.set(option.key, node);
                      } else {
                        optionRefs.current.delete(option.key);
                      }
                    }}
                    type="button"
                    className="combo-item"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setDraft(option.name);
                      setHadEdit(true);
                      onChange?.(option.name);
                      setIsOpen(false);
                    }}
                  >
                    <span className="combo-left">
                      <img className="combo-sprite" src={option.imageSrc} alt="" aria-hidden="true" />
                      <span className="combo-dex">
                        #{String(option.dex).padStart(3, "0")}
                      </span>
                    </span>
                    <span className="combo-name">{option.name}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="combo-empty">No matches</div>
                )}
              </div>
            )}
          </div>

          <button className="btn-primary generate-theme-btn" type="submit">
            Generate theme
          </button>
        </form>
      </div>
    </article>
  );
}

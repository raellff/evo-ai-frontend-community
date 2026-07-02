import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { DOMParser as ProseDOMParser, DOMSerializer } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { history, undo, redo } from 'prosemirror-history';
import { baseKeymap, chainCommands, exitCode } from 'prosemirror-commands';
import { toggleMark } from 'prosemirror-commands';
import { wrapInList } from 'prosemirror-schema-list';
import { messageSchema } from './schema';
import FormattingBubbleMenu, { BubbleMenuRect } from './FormattingBubbleMenu';

/**
 * baseKeymap só mapeia "Enter" (→ splitBlock); "Shift-Enter" não tem binding
 * nenhum no prosemirror-commands, então sem isto a tecla não fazia NADA dentro
 * do editor (nem quebrava linha, nem sobrava pro browser — o contenteditable é
 * controlado pelo ProseMirror). O schema já tem `hard_break` (schema.ts) — só
 * faltava um comando pra inserir o node nele. exitCode primeiro (no-op aqui,
 * sem code_block no schema) por paridade com o Mod-Enter do baseKeymap.
 */
const insertHardBreak = chainCommands(exitCode, (state, dispatch) => {
  const br = messageSchema.nodes.hard_break;
  if (dispatch) dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
  return true;
});

export interface RichTextEditorRef {
  focus: () => void;
  getContent: () => string;
  setContent: (content: string) => void;
  insertText: (text: string) => void;
  clear: () => void;
}

interface RichTextEditorProps {
  placeholder?: string;
  value?: string;
  onChange?: (content: string) => void;
  onKeyDown?: (event: KeyboardEvent) => boolean | void;
  disabled?: boolean;
  className?: string;
  /** Composer estilo pill (§3.1/§3.8): parte com 1 linha; Shift-Enter quebra e a pill cresce até um teto (ver RichTextEditor.css), depois rola verticalmente. */
  singleLine?: boolean;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  (
    {
      placeholder = 'Digite sua nota privada...',
      value = '',
      onChange,
      onKeyDown,
      disabled = false,
      className = '',
      singleLine = false,
    },
    ref,
  ) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const [bubbleRect, setBubbleRect] = useState<BubbleMenuRect | null>(null);

    const onKeyDownRef = useRef(onKeyDown);
    const onChangeRef = useRef(onChange);
    useEffect(() => { onKeyDownRef.current = onKeyDown; }, [onKeyDown]);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

    useImperativeHandle(ref, () => ({
      focus: () => {
        viewRef.current?.focus();
      },
      getContent: () => {
        if (!viewRef.current) return '';
        const doc = viewRef.current.state.doc;
        const serializer = DOMSerializer.fromSchema(messageSchema);
        const fragment = serializer.serializeFragment(doc.content);
        const div = document.createElement('div');
        div.appendChild(fragment);
        return div.innerHTML;
      },
      setContent: (content: string) => {
        if (!viewRef.current) return;
        const isHtml = /<[a-z][\s\S]*>/i.test(content);
        let doc;
        if (isHtml) {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = content;
          doc = ProseDOMParser.fromSchema(messageSchema).parse(wrapper);
        } else {
          doc = messageSchema.nodeFromJSON({
            type: 'doc',
            content: content
              ? [{ type: 'paragraph', content: [{ type: 'text', text: content }] }]
              : [],
          });
        }
        const newState = EditorState.create({
          doc,
          plugins: viewRef.current.state.plugins,
        });
        viewRef.current.updateState(newState);
        setBubbleRect(null);
      },
      insertText: (text: string) => {
        if (!viewRef.current) return;
        const { state, dispatch } = viewRef.current;
        const tr = state.tr.insertText(text);
        dispatch(tr);
        viewRef.current.focus();
      },
      clear: () => {
        if (!viewRef.current) return;
        const emptyDoc = messageSchema.nodeFromJSON({
          type: 'doc',
          content: [],
        });
        const newState = EditorState.create({
          doc: emptyDoc,
          plugins: viewRef.current.state.plugins,
        });
        viewRef.current.updateState(newState);
        setBubbleRect(null);
        onChangeRef.current?.('');
      },
    }));

    useEffect(() => {
      if (!editorRef.current) return;

      const initialDoc = value
        ? messageSchema.nodeFromJSON({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
          })
        : messageSchema.nodeFromJSON({
            type: 'doc',
            content: [],
          });

      const state = EditorState.create({
        doc: initialDoc,
        plugins: [
          history(),
          keymap({
            'Mod-z': undo,
            'Mod-y': redo,
            'Mod-Shift-z': redo,
            'Shift-Enter': insertHardBreak,
            'Mod-b': toggleMark(messageSchema.marks.strong),
            'Mod-i': toggleMark(messageSchema.marks.em),
            'Mod-`': toggleMark(messageSchema.marks.code),
            'Shift-Ctrl-8': wrapInList(messageSchema.nodes.bullet_list),
          }),
          keymap(baseKeymap),
        ],
      });

      // Enter é decidido SÓ aqui, via handleKeyDown (a prop CORRETA do
      // EditorProps para interceptar teclas antes dos keymaps do state — ver
      // prosemirror-view). handleDOMEvents.keydown NÃO é a API certa para
      // isso: é um hook de evento DOM genérico, sem a garantia de rodar antes
      // do keymap(baseKeymap) processar Enter (splitBlock) — por isso
      // Shift+Enter não quebrava linha de forma confiável antes desta troca.
      const view = new EditorView(editorRef.current, {
        state,
        dispatchTransaction: transaction => {
          const newState = view.state.apply(transaction);
          view.updateState(newState);

          if (transaction.docChanged) {
            const doc = newState.doc;
            const content = doc.textContent;
            onChangeRef.current?.(content);
          }

          const { selection } = newState;
          if (selection.empty) {
            setBubbleRect(null);
          } else {
            const anchorCoords = view.coordsAtPos(selection.from);
            const headCoords = view.coordsAtPos(selection.to);
            setBubbleRect({
              top: Math.min(anchorCoords.top, headCoords.top),
              left: (Math.min(anchorCoords.left, headCoords.left) + Math.max(anchorCoords.right, headCoords.right)) / 2,
            });
          }
        },
        handleKeyDown: (_view, event) => {
          if (onKeyDownRef.current) {
            const handled = onKeyDownRef.current(event);
            if (handled) return true;
          }
          return false;
        },
        handleDOMEvents: {
          // Botões do bubble menu usam onMouseDown preventDefault, então um
          // blur real só acontece quando o foco vai pra fora do editor E do
          // menu (ex.: clicar em outro campo da tela) — seguro fechar aqui.
          blur: () => {
            setBubbleRect(null);
            return false;
          },
        },
        editable: () => !disabled,
        attributes: {
          class: [
            'prosemirror-editor',
            'w-full',
            singleLine ? 'prosemirror-editor-singleline' : 'px-1 py-0 max-h-[120px] overflow-y-auto',
            'focus:outline-none resize-none text-sm leading-relaxed text-foreground',
          ].join(' '),
          'data-placeholder': placeholder,
          spellcheck: 'false',
        },
      });

      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (viewRef.current) {
        viewRef.current.setProps({
          editable: () => !disabled,
        });
      }
    }, [disabled]);

    return (
      <div className={className}>
        <div ref={editorRef} className={`relative w-full ${disabled ? 'opacity-50' : ''}`} />
        {bubbleRect && viewRef.current && (
          <FormattingBubbleMenu
            view={viewRef.current}
            rect={bubbleRect}
            onClose={() => setBubbleRect(null)}
          />
        )}
      </div>
    );
  },
);

RichTextEditor.displayName = 'RichTextEditor';

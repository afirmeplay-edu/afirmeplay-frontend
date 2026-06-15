import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Superscript from '@tiptap/extension-superscript';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Heading1, Heading2, Heading3, List, ListOrdered, Code, Type, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Image as ImageIcon, Bold, Italic, Underline as UnderlineIcon, Strikethrough, Eraser, Replace,
  Upload, Move, RotateCcw, Settings, Save, X, Expand, Shrink, MousePointer, Sigma
} from "lucide-react";
import { LatexInsertDialog } from './LatexInsertDialog';
import { normalizePdfLineBreaks } from "@/utils/normalizePdfLineBreaks";
import { ResizableImage } from 'tiptap-extension-resizable-image';
import 'tiptap-extension-resizable-image/styles.css';

interface MyEditorProps {
  value: string;
  onChange: (value: string) => void;
}

interface ImageConfig {
  src: string;
  width?: number;
  height?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  caption?: string;
  borderRadius?: number;
  shadow?: boolean;
}

/** Converte texto puro em HTML de parágrafos, quebrando em \\n\\n e juntando \\n em espaço. */
function normalizePlainTextPaste(text: string): string {
  const paragraphs = text.split(/\n\n+/).map((p) => p.replace(/\n\s*/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (paragraphs.length === 0) return '';
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return paragraphs.map((p) => `<p>${escape(p)}</p>`).join('');
}

const MyEditor = ({ value, onChange }: MyEditorProps) => {
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  // Evita flushSync durante o ciclo de render do React (ex.: quando usado dentro de FormField/Controller).
  // O TipTap chama flushSync ao montar EditorContent; ao montar só após o primeiro commit, o aviso some.
  const [editorContentMounted, setEditorContentMounted] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [currentImageConfig, setCurrentImageConfig] = useState<ImageConfig>({
    src: '',
    width: 300,
    height: undefined,
    align: 'center',
    caption: '',
    borderRadius: 8,
    shadow: true
  });
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [latexOpen, setLatexOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Superscript,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph', 'image'],
        alignments: ['left', 'center', 'right', 'justify'],
        defaultAlignment: 'left',
      }),
      Placeholder.configure({
        placeholder: 'Digite o conteúdo aqui... Use a barra de ferramentas para formatar e inserir imagens.',
      }),
      ResizableImage.configure({
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded-lg shadow-md',
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-lg dark:prose-invert max-w-none focus:outline-none min-h-[300px] p-4 prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-em:text-foreground prose-code:text-foreground prose-pre:bg-muted dark:prose-pre:bg-muted/50 prose-pre:text-foreground',
      },
      handlePaste: (_view, event, _slice) => {
        const ed = editorRef.current;
        if (!ed) return false;
        const html = event.clipboardData?.getData('text/html');
        const plain = event.clipboardData?.getData('text/plain');
        let toInsert: string;
        if (html && html.trim()) {
          toInsert = html;
        } else if (plain != null && plain !== '') {
          toInsert = normalizePlainTextPaste(plain);
          if (!toInsert) return false;
        } else {
          return false;
        }
        ed.commands.insertContent(toInsert);
        event.preventDefault();
        return true;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  // Monta o EditorContent após o primeiro commit para evitar "flushSync was called from inside a lifecycle method"
  useEffect(() => {
    queueMicrotask(() => setEditorContentMounted(true));
  }, []);

  if (!editor) {
    return null;
  }

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImageFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setImagePreview(result);
        setCurrentImageConfig(prev => ({ ...prev, src: result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleInsertImage = () => {
    if (currentImageConfig.src) {
      const imageAttributes = {
        src: currentImageConfig.src,
        alt: currentImageConfig.caption || 'Imagem inserida',
        ...(currentImageConfig.width && { width: currentImageConfig.width }),
        ...(currentImageConfig.height && { height: currentImageConfig.height }),
      };

      // Inserir imagem com configurações
      editor.chain().focus().setResizableImage(imageAttributes).run();

      // Aplicar alinhamento se especificado
      if (currentImageConfig.align && currentImageConfig.align !== 'left') {
        setTimeout(() => {
          editor.chain().focus().setTextAlign(currentImageConfig.align!).run();
        }, 100);
      }

      // Reset e fechar dialog
      setImageDialogOpen(false);
      setCurrentImageConfig({
        src: '',
        width: 300,
        height: undefined,
        align: 'center',
        caption: '',
        borderRadius: 8,
        shadow: true
      });
      setSelectedImageFile(null);
      setImagePreview('');
    }
  };

  const openImageDialog = () => {
    setImageDialogOpen(true);
  };

  const formatCommands = [
    {
      icon: Bold,
      label: 'Negrito',
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
    },
    {
      icon: Italic,
      label: 'Itálico',
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
    },
    {
      icon: UnderlineIcon,
      label: 'Sublinhado',
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: editor.isActive('underline'),
    },
    {
      icon: Strikethrough,
      label: 'Riscado',
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive('strike'),
    },
  ];

  const headingCommands = [
    {
      icon: Heading1,
      label: 'Título 1',
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: editor.isActive('heading', { level: 1 }),
    },
    {
      icon: Heading2,
      label: 'Título 2',
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: editor.isActive('heading', { level: 2 }),
    },
    {
      icon: Heading3,
      label: 'Título 3',
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: editor.isActive('heading', { level: 3 }),
    },
  ];

  const alignCommands = [
    {
      icon: AlignLeft,
      label: 'Alinhar à esquerda',
      action: () => editor.chain().focus().setTextAlign('left').run(),
      isActive: editor.isActive({ textAlign: 'left' }),
    },
    {
      icon: AlignCenter,
      label: 'Centralizar',
      action: () => editor.chain().focus().setTextAlign('center').run(),
      isActive: editor.isActive({ textAlign: 'center' }),
    },
    {
      icon: AlignRight,
      label: 'Alinhar à direita',
      action: () => editor.chain().focus().setTextAlign('right').run(),
      isActive: editor.isActive({ textAlign: 'right' }),
    },
    {
      icon: AlignJustify,
      label: 'Justificar',
      action: () => editor.chain().focus().setTextAlign('justify').run(),
      isActive: editor.isActive({ textAlign: 'justify' }),
    },
  ];

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background dark:bg-card shadow-sm">
      {/* Toolbar */}
      <div className="border-b border-border bg-muted/30 dark:bg-muted/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {/* Formatação básica */}
          <div className="flex items-center gap-1">
            {formatCommands.map((cmd, index) => (
              <Tooltip key={index}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={cmd.action}
                    className={`h-9 w-9 p-0 ${cmd.isActive ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-muted'}`}
                  >
                    <cmd.icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{cmd.label}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          <Separator orientation="vertical" className="h-6 mx-2" />

          {/* Títulos */}
          <div className="flex items-center gap-1">
            {headingCommands.map((cmd, index) => (
              <Tooltip key={index}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={cmd.action}
                    className={`h-9 w-9 p-0 ${cmd.isActive ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-muted'}`}
                  >
                    <cmd.icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{cmd.label}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          <Separator orientation="vertical" className="h-6 mx-2" />

          {/* Lista e código */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  className={`h-9 w-9 p-0 ${editor.isActive('bulletList') ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-muted'}`}
                >
                  <List className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Lista com marcadores</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  className={`h-9 w-9 p-0 ${editor.isActive('orderedList') ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-muted'}`}
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Lista numerada</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  className={`h-9 w-9 p-0 ${editor.isActive('code') ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-muted'}`}
                >
                  <Type className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Código em linha</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().insertContent('²').run()}
                  className="h-9 w-9 p-0 hover:bg-gray-100 dark:hover:bg-muted"
                  title="Inserir elevado (²)"
                >
                  <span className="text-xs font-bold">x²</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Inserir elevado (²)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().insertContent('√').run()}
                  className="h-9 w-9 p-0 font-math hover:bg-gray-100 dark:hover:bg-muted"
                  title="Inserir raiz quadrada"
                >
                  <span className="text-base font-medium" style={{ fontFamily: 'serif' }}>√</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Inserir raiz quadrada (√)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLatexOpen(true)}
                  className="h-9 w-9 p-0 hover:bg-gray-100 dark:hover:bg-muted"
                  aria-label="Inserir expressão LaTeX"
                >
                  <Sigma className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Inserir expressão matemática (LaTeX)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().unsetAllMarks().run()}
                  className="h-9 w-9 p-0 hover:bg-gray-100 dark:hover:bg-muted"
                >
                  <Eraser className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Limpar formatação da seleção</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-6 mx-2" />

          {/* Alinhamento */}
          <div className="flex items-center gap-1">
            {alignCommands.map((cmd, index) => (
              <Tooltip key={index}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={cmd.action}
                    className={`h-9 w-9 p-0 ${cmd.isActive ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-muted'}`}
                  >
                    <cmd.icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{cmd.label}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          <Separator orientation="vertical" className="h-6 mx-2" />

          {/* Ajustar quebras de linha (transformar em espaço onde for continuação de frase) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const html = editor.getHTML();
                  const normalized = normalizePdfLineBreaks(html);
                  if (normalized !== html) {
                    editor.commands.setContent(normalized);
                    onChange(normalized);
                  }
                }}
                className="h-9 px-2 gap-1.5 font-medium text-muted-foreground hover:bg-gray-100 dark:hover:bg-muted hover:text-foreground"
              >
                <Replace className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Ajustar quebras</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Ajustar quebras de linha automaticamente (transformar em espaço onde for continuação de frase)</p>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-2" />

          {/* Imagem */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={openImageDialog}
                className="h-9 px-3 gap-2 font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
              >
                <ImageIcon className="h-4 w-4" />
                Inserir Imagem
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Inserir e configurar imagem</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Editor Content — montado após o primeiro commit para evitar flushSync no ciclo de vida do React */}
      <div className="relative">
        {editorContentMounted ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="prose prose-lg dark:prose-invert max-w-none min-h-[300px] p-4 border-0 rounded-b-lg bg-background" aria-hidden />
        )}
      </div>

      {/* Image Configuration Dialog */}
      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-blue-600" />
              Configurar Imagem
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload e Preview */}
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Selecionar Imagem</Label>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center hover:border-gray-400 dark:hover:border-gray-600 transition-colors bg-gray-50 dark:bg-muted/30">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileSelect}
                    className="hidden"
                    id="image-upload"
                  />
                  <label htmlFor="image-upload" className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto text-gray-400 dark:text-gray-500 mb-2" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Clique para selecionar uma imagem
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      PNG, JPG, GIF até 10MB
                    </p>
                  </label>
                </div>
              </div>

              {/* Preview */}
              {imagePreview && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Preview</Label>
                  <div className="border rounded-lg p-4 bg-gray-50 dark:bg-muted/30 border-border">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-w-full h-auto rounded-lg shadow-sm"
                      style={{
                        maxWidth: currentImageConfig.width ? `${currentImageConfig.width}px` : '100%',
                        borderRadius: `${currentImageConfig.borderRadius}px`,
                        boxShadow: currentImageConfig.shadow ? '0 4px 8px rgba(0,0,0,0.1)' : 'none',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Configurações */}
            <div className="space-y-6">
              {/* Dimensões */}
              <div className="space-y-4">
                <Label className="text-sm font-semibold">Dimensões</Label>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Largura (px)</Label>
                    <Input
                      type="number"
                      value={currentImageConfig.width || ''}
                      onChange={(e) => setCurrentImageConfig(prev => ({ 
                        ...prev, 
                        width: parseInt(e.target.value) || undefined 
                      }))}
                      placeholder="300"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Altura (px)</Label>
                    <Input
                      type="number"
                      value={currentImageConfig.height || ''}
                      onChange={(e) => setCurrentImageConfig(prev => ({ 
                        ...prev, 
                        height: parseInt(e.target.value) || undefined 
                      }))}
                      placeholder="Auto"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentImageConfig(prev => ({ ...prev, width: 200, height: undefined }))}
                  >
                    <Shrink className="h-4 w-4 mr-1" />
                    Pequena
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentImageConfig(prev => ({ ...prev, width: 400, height: undefined }))}
                  >
                    <Expand className="h-4 w-4 mr-1" />
                    Média
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentImageConfig(prev => ({ ...prev, width: 600, height: undefined }))}
                  >
                    <Move className="h-4 w-4 mr-1" />
                    Grande
                  </Button>
                </div>
              </div>

              {/* Alinhamento */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Alinhamento</Label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'left', label: 'Esquerda', icon: AlignLeft },
                    { value: 'center', label: 'Centro', icon: AlignCenter },
                    { value: 'right', label: 'Direita', icon: AlignRight },
                    { value: 'justify', label: 'Justificar', icon: AlignJustify },
                  ].map((align) => (
                    <Button
                      key={align.value}
                      type="button"
                      variant={currentImageConfig.align === align.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentImageConfig(prev => ({ 
                        ...prev, 
                        align: align.value as 'left' | 'center' | 'right' | 'justify' 
                      }))}
                      className="flex-1"
                    >
                      <align.icon className="h-4 w-4 mr-1" />
                      {align.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Bordas e sombra */}
              <div className="space-y-4">
                <Label className="text-sm font-semibold">Estilo</Label>
                
                <div>
                  <Label className="text-xs text-gray-600 mb-2 block">
                    Arredondamento das bordas: {currentImageConfig.borderRadius}px
                  </Label>
                  <Slider
                    value={[currentImageConfig.borderRadius || 0]}
                    onValueChange={(value) => setCurrentImageConfig(prev => ({ 
                      ...prev, 
                      borderRadius: value[0] 
                    }))}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="shadow"
                    checked={currentImageConfig.shadow}
                    onChange={(e) => setCurrentImageConfig(prev => ({ 
                      ...prev, 
                      shadow: e.target.checked 
                    }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <Label htmlFor="shadow" className="text-sm cursor-pointer">
                    Aplicar sombra
                  </Label>
                </div>
              </div>

              {/* Legenda */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">Legenda (opcional)</Label>
                <Input
                  value={currentImageConfig.caption || ''}
                  onChange={(e) => setCurrentImageConfig(prev => ({ 
                    ...prev, 
                    caption: e.target.value 
                  }))}
                  placeholder="Descrição da imagem"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImageDialogOpen(false)}
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleInsertImage}
              disabled={!currentImageConfig.src}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="h-4 w-4 mr-2" />
              Inserir Imagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LatexInsertDialog
        open={latexOpen}
        onOpenChange={setLatexOpen}
        onInsert={(wrappedLatex) => editor.chain().focus().insertContent(wrappedLatex).run()}
      />
    </div>
  );
};

export default MyEditor;
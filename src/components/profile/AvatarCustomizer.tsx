import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { AvatarPreview } from '@/components/profile/AvatarPreview';
import { AvatarConfig, useAuth } from '@/context/authContext';
import { storeApi } from '@/services/store/storeService';
import { useStudentPreferences } from '@/context/StudentPreferencesContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Save, RotateCcw, Sparkles, Circle, Lock, ShoppingBag } from 'lucide-react';

interface AvatarCustomizerProps {
    config: AvatarConfig;
    onConfigChange: (config: Partial<AvatarConfig>) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
    /** Quando true, oculta o botão Salvar (ex.: onboarding, onde o save é ao concluir) */
    hideSaveButton?: boolean;
}

const HAIR_VARIANTS = Array.from({ length: 48 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);
const EYES_VARIANTS = Array.from({ length: 24 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);
const EYEBROWS_VARIANTS = Array.from({ length: 13 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);
const HEAD_VARIANTS = Array.from({ length: 4 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);
const MOUTH_VARIANTS = [
    ...Array.from({ length: 18 }, (_, i) => `happy${String(i + 1).padStart(2, '0')}`),
    ...Array.from({ length: 9 }, (_, i) => `sad${String(i + 1).padStart(2, '0')}`),
];
const NOSE_VARIANTS = Array.from({ length: 6 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);
const BEARD_VARIANTS = Array.from({ length: 2 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);
const EARRINGS_VARIANTS = Array.from({ length: 3 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);
const GLASSES_VARIANTS = Array.from({ length: 5 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);

// Cores pré-definidas para cabelo
const HAIR_COLORS = [
    { value: '000000', label: 'Preto', color: '#000000' },
    { value: '1a1a1a', label: 'Preto Escuro', color: '#1a1a1a' },
    { value: '2c1810', label: 'Marrom Escuro', color: '#2c1810' },
    { value: '4a2c1a', label: 'Marrom', color: '#4a2c1a' },
    { value: '6b4423', label: 'Marrom Médio', color: '#6b4423' },
    { value: '8b4513', label: 'Castanho', color: '#8b4513' },
    { value: 'a0522d', label: 'Marrom Claro', color: '#a0522d' },
    { value: 'c19a6b', label: 'Louro Escuro', color: '#c19a6b' },
    { value: 'd4a574', label: 'Louro Médio', color: '#d4a574' },
    { value: 'f4dbb0', label: 'Louro Claro', color: '#f4dbb0' },
    { value: 'fff8dc', label: 'Louro Muito Claro', color: '#fff8dc' },
    { value: '8b2500', label: 'Ruivo Escuro', color: '#8b2500' },
    { value: 'a03322', label: 'Ruivo', color: '#a03322' },
    { value: 'cd5c5c', label: 'Ruivo Claro', color: '#cd5c5c' },
    { value: 'c0c0c0', label: 'Prata/Cinza', color: '#c0c0c0' },
    { value: '808080', label: 'Cinza', color: '#808080' },
];

// Tons de pele pré-definidos
const SKIN_COLORS = [
    { value: 'ffffff', label: 'Muito Claro', color: '#ffffff' },
    { value: 'fff5e1', label: 'Claro', color: '#fff5e1' },
    { value: 'ffe0b2', label: 'Claro Médio', color: '#ffe0b2' },
    { value: 'ffcc99', label: 'Médio', color: '#ffcc99' },
    { value: 'e6ac7a', label: 'Médio Claro', color: '#e6ac7a' },
    { value: 'd49c6b', label: 'Médio Médio', color: '#d49c6b' },
    { value: 'c68e5a', label: 'Médio Escuro', color: '#c68e5a' },
    { value: 'b37f4a', label: 'Escuro Claro', color: '#b37f4a' },
    { value: '9d7039', label: 'Escuro Médio', color: '#9d7039' },
    { value: '8b5a29', label: 'Escuro', color: '#8b5a29' },
    { value: '7a4a1a', label: 'Muito Escuro', color: '#7a4a1a' },
    { value: '6b3d0a', label: 'Muito Escuro Mais', color: '#6b3d0a' },
];

// Cores de olhos pré-definidas
const EYES_COLORS = [
    { value: '1a1a1a', label: 'Preto', color: '#1a1a1a' },
    { value: '4a2c1a', label: 'Marrom Escuro', color: '#4a2c1a' },
    { value: '6b4423', label: 'Marrom', color: '#6b4423' },
    { value: '8b4513', label: 'Castanho', color: '#8b4513' },
    { value: 'a0522d', label: 'Marrom Claro', color: '#a0522d' },
    { value: '228b22', label: 'Verde', color: '#228b22' },
    { value: '32cd32', label: 'Verde Claro', color: '#32cd32' },
    { value: '0066cc', label: 'Azul', color: '#0066cc' },
    { value: '4169e1', label: 'Azul Real', color: '#4169e1' },
    { value: '87ceeb', label: 'Azul Claro', color: '#87ceeb' },
    { value: '808080', label: 'Cinza', color: '#808080' },
    { value: '708090', label: 'Cinza Azulado', color: '#708090' },
    { value: 'dda0dd', label: 'Roxo Claro', color: '#dda0dd' },
    { value: '9370db', label: 'Roxo', color: '#9370db' },
];

// Cores de sobrancelhas pré-definidas (similar ao cabelo)
const EYEBROWS_COLORS = [
    { value: '000000', label: 'Preto', color: '#000000' },
    { value: '1a1a1a', label: 'Preto Escuro', color: '#1a1a1a' },
    { value: '2c1810', label: 'Marrom Escuro', color: '#2c1810' },
    { value: '4a2c1a', label: 'Marrom', color: '#4a2c1a' },
    { value: '6b4423', label: 'Marrom Médio', color: '#6b4423' },
    { value: '8b4513', label: 'Castanho', color: '#8b4513' },
    { value: 'a0522d', label: 'Marrom Claro', color: '#a0522d' },
    { value: 'c19a6b', label: 'Louro Escuro', color: '#c19a6b' },
    { value: 'd4a574', label: 'Louro Médio', color: '#d4a574' },
    { value: 'f4dbb0', label: 'Louro Claro', color: '#f4dbb0' },
    { value: '8b2500', label: 'Ruivo Escuro', color: '#8b2500' },
    { value: 'a03322', label: 'Ruivo', color: '#a03322' },
];

// Cores de nariz e boca pré-definidas (tons de pele/rosa)
const NOSE_COLORS = [
    { value: 'ffffff', label: 'Muito Claro', color: '#ffffff' },
    { value: 'fff5e1', label: 'Claro', color: '#fff5e1' },
    { value: 'ffe0b2', label: 'Claro Médio', color: '#ffe0b2' },
    { value: 'ffcc99', label: 'Médio', color: '#ffcc99' },
    { value: 'e6ac7a', label: 'Médio Claro', color: '#e6ac7a' },
    { value: 'd49c6b', label: 'Médio Médio', color: '#d49c6b' },
    { value: 'c68e5a', label: 'Médio Escuro', color: '#c68e5a' },
    { value: 'b37f4a', label: 'Escuro Claro', color: '#b37f4a' },
    { value: '9d7039', label: 'Escuro Médio', color: '#9d7039' },
    { value: '8b5a29', label: 'Escuro', color: '#8b5a29' },
];

// Cores de boca pré-definidas (tons rosa/vermelho)
const MOUTH_COLORS = [
    { value: 'dc143c', label: 'Vermelho', color: '#dc143c' },
    { value: 'ff69b4', label: 'Rosa Quente', color: '#ff69b4' },
    { value: 'ff1493', label: 'Rosa Profundo', color: '#ff1493' },
    { value: 'ffb6c1', label: 'Rosa Claro', color: '#ffb6c1' },
    { value: 'ffc0cb', label: 'Rosa', color: '#ffc0cb' },
    { value: 'ff6347', label: 'Coral', color: '#ff6347' },
    { value: 'cd5c5c', label: 'Rosa Indiano', color: '#cd5c5c' },
    { value: 'db7093', label: 'Rosa Pálido', color: '#db7093' },
    { value: 'c71585', label: 'Violeta Vermelho', color: '#c71585' },
    { value: 'dda0dd', label: 'Lavanda', color: '#dda0dd' },
    { value: 'f0a68c', label: 'Pêssego', color: '#f0a68c' },
    { value: 'e9967a', label: 'Salmão Escuro', color: '#e9967a' },
];

// Cores de fundo pré-definidas
const BACKGROUND_COLORS = [
    { value: 'b6e3f4', label: 'Azul Claro', color: '#b6e3f4' },
    { value: '87ceeb', label: 'Céu Azul', color: '#87ceeb' },
    { value: 'add8e6', label: 'Azul Claro', color: '#add8e6' },
    { value: 'f0f8ff', label: 'Alice Azul', color: '#f0f8ff' },
    { value: 'e0f2fe', label: 'Azul Muito Claro', color: '#e0f2fe' },
    { value: 'fef3c7', label: 'Amarelo Claro', color: '#fef3c7' },
    { value: 'fce7f3', label: 'Rosa Claro', color: '#fce7f3' },
    { value: 'e9d5ff', label: 'Roxo Claro', color: '#e9d5ff' },
    { value: 'd1fae5', label: 'Verde Claro', color: '#d1fae5' },
    { value: 'fff1f2', label: 'Rosa Muito Claro', color: '#fff1f2' },
    { value: 'f0fdf4', label: 'Verde Muito Claro', color: '#f0fdf4' },
    { value: 'ffffff', label: 'Branco', color: '#ffffff' },
];

// Cores de acessórios pré-definidas (cores vibrantes)
const ACCESSORIES_COLORS = [
    { value: '000000', label: 'Preto', color: '#000000' },
    { value: 'ffffff', label: 'Branco', color: '#ffffff' },
    { value: '808080', label: 'Cinza', color: '#808080' },
    { value: '8b4513', label: 'Marrom', color: '#8b4513' },
    { value: 'ffd700', label: 'Dourado', color: '#ffd700' },
    { value: 'c0c0c0', label: 'Prata', color: '#c0c0c0' },
    { value: 'cd7f32', label: 'Bronze', color: '#cd7f32' },
    { value: 'ff6347', label: 'Coral', color: '#ff6347' },
    { value: 'ff69b4', label: 'Rosa Quente', color: '#ff69b4' },
    { value: '0066cc', label: 'Azul', color: '#0066cc' },
    { value: '32cd32', label: 'Verde', color: '#32cd32' },
    { value: '9370db', label: 'Roxo', color: '#9370db' },
];

// Cores de sardas pré-definidas (tons marrom/bege)
const FRECKLES_COLORS = [
    { value: 'd2b48c', label: 'Bege', color: '#d2b48c' },
    { value: 'deb887', label: 'Bege Claro', color: '#deb887' },
    { value: 'f5deb3', label: 'Trigo', color: '#f5deb3' },
    { value: 'daa520', label: 'Dourado Claro', color: '#daa520' },
    { value: 'cd853f', label: 'Marrom Peruano', color: '#cd853f' },
    { value: 'a0522d', label: 'Sienna', color: '#a0522d' },
    { value: '8b4513', label: 'Marrom Sela', color: '#8b4513' },
    { value: '6b4423', label: 'Marrom', color: '#6b4423' },
];

// Helper function para garantir valores seguros para Select
const getSafeSelectValue = (arrayValue: string[] | undefined | null): string | undefined => {
    if (!arrayValue || !Array.isArray(arrayValue) || arrayValue.length === 0 || !arrayValue[0]) {
        return undefined;
    }
    return arrayValue[0];
};

export const AvatarCustomizer = ({ config, onConfigChange, onSave, isSaving, hideSaveButton }: AvatarCustomizerProps) => {
    const { user } = useAuth();
    const prefs = useStudentPreferences();
    const [purchasedFrameIds, setPurchasedFrameIds] = useState<string[]>([]);
    const ownedFrames = Array.from(new Set([
        ...(user?.owned_frames ?? []),
        ...purchasedFrameIds,
        ...(prefs?.preferences?.frame_id ? [prefs.preferences.frame_id] : []),
    ]));

    useEffect(() => {
        let cancelled = false;
        storeApi
            .getMyPurchases({ limit: 100, offset: 0 })
            .then(({ data }) => {
                if (cancelled) return;
                const ids = (data.purchases ?? [])
                    .filter((p) => String(p.reward_type ?? '').trim().toLowerCase() === 'frame' && p.reward_data)
                    .map((p) => String(p.reward_data));
                setPurchasedFrameIds(ids);
            })
            .catch(() => {
                if (!cancelled) setPurchasedFrameIds([]);
            });
        return () => {
            cancelled = true;
        };
    }, [user?.id]);
    const [previewModal, setPreviewModal] = useState<{
        open: boolean;
        field: string;
        variants: string[];
        fieldLabel: string;
    } | null>(null);

    const handleOpenPreview = (field: string, variants: string[], fieldLabel: string) => {
        setPreviewModal({
            open: true,
            field,
            variants,
            fieldLabel,
        });
    };

    const handleSelectVariant = (variant: string) => {
        if (!previewModal) return;

        const updates: Partial<AvatarConfig> = {
            [previewModal.field]: [variant],
        };

        // Para acessórios, definir probabilidade como 100%
        if (previewModal.field === 'glasses') {
            updates.glassesProbability = 100;
        } else if (previewModal.field === 'earrings') {
            updates.earringsProbability = 100;
        }

        onConfigChange(updates);
        setPreviewModal(null);
    };

    const handleClosePreview = () => {
        setPreviewModal(null);
    };

    const generatePreviewConfig = (variant: string): AvatarConfig => {
        const previewConfig: AvatarConfig = { ...config };
        
        if (previewModal) {
            const field = previewModal.field;
            
            // Atualizar o campo específico com a variante
            if (field === 'head') previewConfig.head = [variant];
            else if (field === 'eyes') previewConfig.eyes = [variant];
            else if (field === 'eyebrows') previewConfig.eyebrows = [variant];
            else if (field === 'nose') previewConfig.nose = [variant];
            else if (field === 'mouth') previewConfig.mouth = [variant];
            else if (field === 'freckles') previewConfig.freckles = [variant];
            else if (field === 'hair') previewConfig.hair = [variant];
            else if (field === 'hairAccessories') previewConfig.hairAccessories = [variant];
            else if (field === 'beard') previewConfig.beard = [variant];
            else if (field === 'glasses') previewConfig.glasses = [variant];
            else if (field === 'earrings') previewConfig.earrings = [variant];
        }
        
        return previewConfig;
    };

    const handleReset = () => {
        onConfigChange({
            seed: '',
            flip: false,
            rotate: 0,
            scale: 100,
            radius: 0,
            size: 128,
            backgroundColor: ['b6e3f4'],
            backgroundType: ['solid'],
            backgroundRotation: [],
            translateX: 0,
            translateY: 0,
            clip: true,
            randomizeIds: false,
            skinColor: ['ffffff'],
            hair: [],
            hairColor: [],
            hairAccessories: [],
            hairAccessoriesColor: [],
            hairAccessoriesProbability: 0,
            beard: [],
            beardProbability: 0,
            eyes: [],
            eyesColor: [],
            eyebrows: [],
            eyebrowsColor: [],
            nose: [],
            noseColor: [],
            mouth: [],
            mouthColor: [],
            head: [],
            freckles: [],
            frecklesColor: [],
            frecklesProbability: 0,
            glasses: [],
            glassesColor: [],
            glassesProbability: 0,
            earrings: [],
            earringsColor: [],
            earringsProbability: 0,
            frame: undefined,
        });
    };

    const handleSave = async () => {
        if (!config.seed || config.seed.trim() === '') {
            // Se não tem seed, usar um padrão baseado na data/hora
            onConfigChange({ seed: `user_${Date.now()}` });
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        await onSave();
    };

    const handleRandomize = () => {
        const randomSeed = `random_${Math.random().toString(36).substring(2, 15)}`;
        onConfigChange({ 
            seed: randomSeed,
            rotate: Math.floor(Math.random() * 360),
            scale: Math.floor(Math.random() * 100) + 50,
        });
    };

    return (
        <div className="space-y-4 sm:space-y-6 min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl sm:text-2xl font-bold">Personalizar Avatar</h2>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0 sm:size-default" onClick={handleRandomize}>
                        <Sparkles className="h-4 w-4 mr-1.5 sm:mr-2" />
                        <span>Aleatório</span>
                    </Button>
                    <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0 sm:size-default" onClick={handleReset}>
                        <RotateCcw className="h-4 w-4 mr-1.5 sm:mr-2" />
                        <span>Resetar</span>
                    </Button>
                    {!hideSaveButton && (
                        <Button size="sm" className="min-h-[44px] sm:min-h-0 sm:size-default" onClick={handleSave} disabled={isSaving}>
                            <Save className="h-4 w-4 mr-1.5 sm:mr-2" />
                            {isSaving ? 'Salvando...' : 'Salvar'}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0">
                <div className="lg:col-span-1 min-w-0">
                    <Card>
                        <CardHeader className="px-4 sm:px-6">
                            <CardTitle>Preview</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 sm:px-6">
                            <div className="flex justify-center">
                                <AvatarPreview config={config} size={200} className="py-4 sm:py-6 max-w-full" />
                            </div>
                            <div className="text-center mt-4">
                                <p className="text-sm text-muted-foreground">
                                    Seed: <span className="font-mono text-xs">{config.seed || 'Não definido'}</span>
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-2 min-w-0 overflow-hidden">
                    <Tabs defaultValue="basic" className="w-full">
                        <TabsList className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 h-auto gap-1 p-1.5">
                            <TabsTrigger value="basic" className="text-xs sm:text-sm py-2 px-2">Básico</TabsTrigger>
                            <TabsTrigger value="face" className="text-xs sm:text-sm py-2 px-2">Rosto</TabsTrigger>
                            <TabsTrigger value="hair" className="text-xs sm:text-sm py-2 px-2">Cabelo</TabsTrigger>
                            <TabsTrigger value="accessories" className="text-xs sm:text-sm py-2 px-2">Acess.</TabsTrigger>
                            <TabsTrigger value="background" className="text-xs sm:text-sm py-2 px-2">Fundo</TabsTrigger>
                            <TabsTrigger value="frame" className="text-xs sm:text-sm py-2 px-2">Moldura</TabsTrigger>
                            <TabsTrigger value="advanced" className="text-xs sm:text-sm py-2 px-2">Avançado</TabsTrigger>
                        </TabsList>

                        <TabsContent value="basic" className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="seed">Seed (Nome único) *</Label>
                                    <Input
                                        id="seed"
                                        value={config.seed || ''}
                                        onChange={(e) => onConfigChange({ seed: e.target.value })}
                                        placeholder="Digite um nome único"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        O seed determina como o avatar será gerado. Use um nome único para ter sempre o mesmo avatar.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="size">Tamanho: {config.size || 128}</Label>
                                    <Slider
                                        id="size"
                                        min={32}
                                        max={200}
                                        step={16}
                                        value={[config.size || 128]}
                                        onValueChange={([value]) => onConfigChange({ size: value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="scale">Escala: {config.scale || 100}%</Label>
                                    <Slider
                                        id="scale"
                                        min={0}
                                        max={200}
                                        step={10}
                                        value={[config.scale || 100]}
                                        onValueChange={([value]) => onConfigChange({ scale: value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="radius">Raio: {config.radius || 0}</Label>
                                    <Slider
                                        id="radius"
                                        min={0}
                                        max={50}
                                        step={5}
                                        value={[config.radius || 0]}
                                        onValueChange={([value]) => onConfigChange({ radius: value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rotate">Rotação: {config.rotate || 0}°</Label>
                                    <Slider
                                        id="rotate"
                                        min={0}
                                        max={360}
                                        step={15}
                                        value={[config.rotate || 0]}
                                        onValueChange={([value]) => onConfigChange({ rotate: value })}
                                    />
                                </div>
                                <div className="flex items-center space-x-2 pt-6">
                                    <Switch
                                        id="flip"
                                        checked={config.flip || false}
                                        onCheckedChange={(checked) => onConfigChange({ flip: checked })}
                                    />
                                    <Label htmlFor="flip">Espelhar</Label>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="face" className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="head">Cabeça</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPreview('head', HEAD_VARIANTS, 'Cabeça')}
                                    >
                                        {getSafeSelectValue(config.head) || 'Selecione'}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="skinColor">Cor da Pele</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {SKIN_COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                type="button"
                                                onClick={() => onConfigChange({ skinColor: [colorOption.value] })}
                                                className={`w-full h-10 rounded border-2 transition-all ${
                                                    config.skinColor?.[0] === colorOption.value
                                                        ? 'border-blue-500 ring-2 ring-blue-300'
                                                        : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: colorOption.color }}
                                                title={colorOption.label}
                                                aria-label={colorOption.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="eyes">Olhos</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPreview('eyes', EYES_VARIANTS, 'Olhos')}
                                    >
                                        {getSafeSelectValue(config.eyes) || 'Selecione'}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="eyesColor">Cor dos Olhos</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {EYES_COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                type="button"
                                                onClick={() => onConfigChange({ eyesColor: [colorOption.value] })}
                                                className={`w-full h-10 rounded border-2 transition-all ${
                                                    config.eyesColor?.[0] === colorOption.value
                                                        ? 'border-blue-500 ring-2 ring-blue-300'
                                                        : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: colorOption.color }}
                                                title={colorOption.label}
                                                aria-label={colorOption.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="eyebrows">Sobrancelhas</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPreview('eyebrows', EYEBROWS_VARIANTS, 'Sobrancelhas')}
                                    >
                                        {getSafeSelectValue(config.eyebrows) || 'Selecione'}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="eyebrowsColor">Cor das Sobrancelhas</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {EYEBROWS_COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                type="button"
                                                onClick={() => onConfigChange({ eyebrowsColor: [colorOption.value] })}
                                                className={`w-full h-10 rounded border-2 transition-all ${
                                                    config.eyebrowsColor?.[0] === colorOption.value
                                                        ? 'border-blue-500 ring-2 ring-blue-300'
                                                        : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: colorOption.color }}
                                                title={colorOption.label}
                                                aria-label={colorOption.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="nose">Nariz</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPreview('nose', NOSE_VARIANTS, 'Nariz')}
                                    >
                                        {getSafeSelectValue(config.nose) || 'Selecione'}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="noseColor">Cor do Nariz</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {NOSE_COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                type="button"
                                                onClick={() => onConfigChange({ noseColor: [colorOption.value] })}
                                                className={`w-full h-10 rounded border-2 transition-all ${
                                                    config.noseColor?.[0] === colorOption.value
                                                        ? 'border-blue-500 ring-2 ring-blue-300'
                                                        : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: colorOption.color }}
                                                title={colorOption.label}
                                                aria-label={colorOption.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="mouth">Boca</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPreview('mouth', MOUTH_VARIANTS, 'Boca')}
                                    >
                                        {getSafeSelectValue(config.mouth) || 'Selecione'}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="mouthColor">Cor da Boca</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {MOUTH_COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                type="button"
                                                onClick={() => onConfigChange({ mouthColor: [colorOption.value] })}
                                                className={`w-full h-10 rounded border-2 transition-all ${
                                                    config.mouthColor?.[0] === colorOption.value
                                                        ? 'border-blue-500 ring-2 ring-blue-300'
                                                        : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: colorOption.color }}
                                                title={colorOption.label}
                                                aria-label={colorOption.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="freckles">Sardas</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPreview('freckles', ['variant01'], 'Sardas')}
                                    >
                                        {getSafeSelectValue(config.freckles) || 'Nenhuma'}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="frecklesColor">Cor das Sardas</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {FRECKLES_COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                type="button"
                                                onClick={() => onConfigChange({ frecklesColor: [colorOption.value] })}
                                                className={`w-full h-10 rounded border-2 transition-all ${
                                                    config.frecklesColor?.[0] === colorOption.value
                                                        ? 'border-blue-500 ring-2 ring-blue-300'
                                                        : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: colorOption.color }}
                                                title={colorOption.label}
                                                aria-label={colorOption.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="frecklesProbability">Probabilidade de Sardas: {config.frecklesProbability || 0}%</Label>
                                    <Slider
                                        id="frecklesProbability"
                                        min={0}
                                        max={100}
                                        step={10}
                                        value={[config.frecklesProbability || 0]}
                                        onValueChange={([value]) => onConfigChange({ frecklesProbability: value })}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="hair" className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="hair">Estilo de Cabelo</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPreview('hair', HAIR_VARIANTS, 'Estilo de Cabelo')}
                                    >
                                        {getSafeSelectValue(config.hair) || 'Selecione'}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hairColor">Cor do Cabelo</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {HAIR_COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                type="button"
                                                onClick={() => onConfigChange({ hairColor: [colorOption.value] })}
                                                className={`w-full h-10 rounded border-2 transition-all ${
                                                    config.hairColor?.[0] === colorOption.value
                                                        ? 'border-blue-500 ring-2 ring-blue-300'
                                                        : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: colorOption.color }}
                                                title={colorOption.label}
                                                aria-label={colorOption.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hairAccessories">Acessórios de Cabelo</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPreview('hairAccessories', ['flowers'], 'Acessórios de Cabelo')}
                                    >
                                        {getSafeSelectValue(config.hairAccessories) || 'Nenhum'}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hairAccessoriesColor">Cor dos Acessórios</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {ACCESSORIES_COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                type="button"
                                                onClick={() => onConfigChange({ hairAccessoriesColor: [colorOption.value] })}
                                                className={`w-full h-10 rounded border-2 transition-all ${
                                                    config.hairAccessoriesColor?.[0] === colorOption.value
                                                        ? 'border-blue-500 ring-2 ring-blue-300'
                                                        : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: colorOption.color }}
                                                title={colorOption.label}
                                                aria-label={colorOption.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hairAccessoriesProbability">Probabilidade de Acessórios: {config.hairAccessoriesProbability || 0}%</Label>
                                    <Slider
                                        id="hairAccessoriesProbability"
                                        min={0}
                                        max={100}
                                        step={10}
                                        value={[config.hairAccessoriesProbability || 0]}
                                        onValueChange={([value]) => onConfigChange({ hairAccessoriesProbability: value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="beard">Barba</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPreview('beard', BEARD_VARIANTS, 'Barba')}
                                    >
                                        {getSafeSelectValue(config.beard) || 'Nenhuma'}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="beardProbability">Probabilidade de Barba: {config.beardProbability || 0}%</Label>
                                    <Slider
                                        id="beardProbability"
                                        min={0}
                                        max={100}
                                        step={10}
                                        value={[config.beardProbability || 0]}
                                        onValueChange={([value]) => onConfigChange({ beardProbability: value })}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="accessories" className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="glasses">Óculos</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPreview('glasses', GLASSES_VARIANTS, 'Óculos')}
                                    >
                                        {getSafeSelectValue(config.glasses) || 'Nenhum'}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="glassesColor">Cor dos Óculos</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {ACCESSORIES_COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                type="button"
                                                onClick={() => onConfigChange({ glassesColor: [colorOption.value] })}
                                                className={`w-full h-10 rounded border-2 transition-all ${
                                                    config.glassesColor?.[0] === colorOption.value
                                                        ? 'border-blue-500 ring-2 ring-blue-300'
                                                        : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: colorOption.color }}
                                                title={colorOption.label}
                                                aria-label={colorOption.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="glassesProbability">Probabilidade de Óculos: {config.glassesProbability || 0}%</Label>
                                    <Slider
                                        id="glassesProbability"
                                        min={0}
                                        max={100}
                                        step={10}
                                        value={[config.glassesProbability || 0]}
                                        onValueChange={([value]) => onConfigChange({ glassesProbability: value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="earrings">Brincos</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPreview('earrings', EARRINGS_VARIANTS, 'Brincos')}
                                    >
                                        {getSafeSelectValue(config.earrings) || 'Nenhum'}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="earringsColor">Cor dos Brincos</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {ACCESSORIES_COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                type="button"
                                                onClick={() => onConfigChange({ earringsColor: [colorOption.value] })}
                                                className={`w-full h-10 rounded border-2 transition-all ${
                                                    config.earringsColor?.[0] === colorOption.value
                                                        ? 'border-blue-500 ring-2 ring-blue-300'
                                                        : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: colorOption.color }}
                                                title={colorOption.label}
                                                aria-label={colorOption.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="earringsProbability">Probabilidade de Brincos: {config.earringsProbability || 0}%</Label>
                                    <Slider
                                        id="earringsProbability"
                                        min={0}
                                        max={100}
                                        step={10}
                                        value={[config.earringsProbability || 0]}
                                        onValueChange={([value]) => onConfigChange({ earringsProbability: value })}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="background" className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="backgroundColor">Cor de Fundo</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {BACKGROUND_COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                type="button"
                                                onClick={() => onConfigChange({ backgroundColor: [colorOption.value] })}
                                                className={`w-full h-10 rounded border-2 transition-all ${
                                                    config.backgroundColor?.[0] === colorOption.value
                                                        ? 'border-blue-500 ring-2 ring-blue-300'
                                                        : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: colorOption.color }}
                                                title={colorOption.label}
                                                aria-label={colorOption.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="backgroundType">Tipo de Fundo</Label>
                                    <Select
                                        value={config.backgroundType?.[0] || 'solid'}
                                        onValueChange={(value) => onConfigChange({ backgroundType: [value] })}
                                    >
                                        <SelectTrigger id="backgroundType">
                                            <SelectValue placeholder="Selecione" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="solid">Sólido</SelectItem>
                                            <SelectItem value="gradientLinear">Gradiente Linear</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="backgroundRotation">Rotação do Gradiente: {config.backgroundRotation?.[0] || 0}°</Label>
                                    <Slider
                                        id="backgroundRotation"
                                        min={0}
                                        max={360}
                                        step={15}
                                        value={[config.backgroundRotation?.[0] || 0]}
                                        onValueChange={([value]) => onConfigChange({ backgroundRotation: [value, value] })}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="frame" className="space-y-4 mt-4">
                            <Label>Moldura do avatar</Label>
                            <p className="text-sm text-muted-foreground mb-3">
                                Escolha uma moldura para exibir ao redor da sua foto de perfil. Molduras premium são desbloqueadas ao comprar na loja.
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {[
                                    { value: 'none', label: 'Nenhuma', icon: Circle, color: 'border-muted' },
                                    { value: 'gold', label: 'Dourada', icon: Circle, color: 'border-amber-400 bg-gradient-to-br from-amber-300 to-amber-500' },
                                    { value: 'silver', label: 'Prata', icon: Circle, color: 'border-slate-300 bg-gradient-to-br from-slate-200 to-slate-400' },
                                    { value: 'bronze', label: 'Bronze', icon: Circle, color: 'border-amber-600 bg-gradient-to-br from-amber-600 to-amber-800' },
                                    { value: 'gradient', label: 'Gradiente', icon: Circle, color: 'border-transparent bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600' },
                                ].map((opt) => {
                                    const isNone = opt.value === 'none';
                                    const owned = isNone || ownedFrames.includes(opt.value);
                                    const selected = (config.frame || 'none') === opt.value;
                                    return (
                                        <div key={opt.value} className="relative flex flex-col">
                                            <button
                                                type="button"
                                                onClick={() => owned && onConfigChange({ frame: isNone ? undefined : opt.value })}
                                                disabled={!owned}
                                                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all ${
                                                    !owned ? 'opacity-60 cursor-not-allowed' : ''
                                                } ${selected ? 'ring-2 ring-primary ring-offset-2' : 'hover:bg-muted/50'}`}
                                            >
                                                {!owned && (
                                                    <span className="absolute top-2 right-2 rounded-full bg-muted p-1" title="Compre na loja para desbloquear">
                                                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                                    </span>
                                                )}
                                                <div className={`w-12 h-12 rounded-full border-2 ${opt.color} ${!owned ? 'grayscale' : ''}`} />
                                                <span className="text-xs font-medium">{opt.label}</span>
                                            </button>
                                            {!owned && !isNone && (
                                                <Button variant="link" className="h-auto p-1 text-xs mt-1" asChild>
                                                    <Link to="/aluno/loja" className="flex items-center gap-1">
                                                        <ShoppingBag className="h-3 w-3" />
                                                        Comprar na loja
                                                    </Link>
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </TabsContent>

                        <TabsContent value="advanced" className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="translateX">Translação X: {config.translateX || 0}</Label>
                                    <Slider
                                        id="translateX"
                                        min={-100}
                                        max={100}
                                        step={5}
                                        value={[config.translateX || 0]}
                                        onValueChange={([value]) => onConfigChange({ translateX: value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="translateY">Translação Y: {config.translateY || 0}</Label>
                                    <Slider
                                        id="translateY"
                                        min={-100}
                                        max={100}
                                        step={5}
                                        value={[config.translateY || 0]}
                                        onValueChange={([value]) => onConfigChange({ translateY: value })}
                                    />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="clip"
                                        checked={config.clip !== false}
                                        onCheckedChange={(checked) => onConfigChange({ clip: checked })}
                                    />
                                    <Label htmlFor="clip">Recortar</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="randomizeIds"
                                        checked={config.randomizeIds || false}
                                        onCheckedChange={(checked) => onConfigChange({ randomizeIds: checked })}
                                    />
                                    <Label htmlFor="randomizeIds">Randomizar IDs</Label>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Modal de Pré-visualização */}
            <Dialog open={previewModal?.open || false} onOpenChange={(open) => {
                if (!open) {
                    handleClosePreview();
                }
            }}>
                <DialogContent className="sm:max-w-7xl max-w-[95vw] max-h-[95vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Selecione {previewModal?.fieldLabel}</DialogTitle>
                        <DialogDescription>
                            Clique em uma opção para visualizar e selecionar.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 py-4">
                        {/* Opção "Nenhum" para acessórios */}
                        {previewModal && (previewModal.field === 'glasses' || previewModal.field === 'earrings') && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (previewModal.field === 'glasses') {
                                        onConfigChange({ glasses: [], glassesProbability: 0 });
                                    } else if (previewModal.field === 'earrings') {
                                        onConfigChange({ earrings: [], earringsProbability: 0 });
                                    }
                                    handleClosePreview();
                                }}
                                className={`flex flex-col items-center p-6 rounded-lg border-2 transition-all hover:border-blue-500 ${
                                    !getSafeSelectValue(config[previewModal.field as keyof AvatarConfig] as string[])
                                        ? 'border-blue-500 ring-2 ring-blue-300 bg-blue-50'
                                        : 'border-gray-300 bg-white'
                                }`}
                            >
                                <div className="w-32 h-32 rounded-full border-2 border-gray-300 bg-gray-100 flex items-center justify-center mb-3">
                                    <span className="text-lg text-gray-500">—</span>
                                </div>
                                <span className="text-base text-center font-medium">Nenhum</span>
                            </button>
                        )}
                        
                        {/* Variantes */}
                        {previewModal?.variants.map((variant) => {
                            const previewConfig = generatePreviewConfig(variant);
                            const currentValue = getSafeSelectValue(config[previewModal.field as keyof AvatarConfig] as string[]);
                            const isSelected = currentValue === variant;
                            
                            return (
                                <button
                                    key={variant}
                                    type="button"
                                    onClick={() => handleSelectVariant(variant)}
                                    className={`flex flex-col items-center p-6 rounded-lg border-2 transition-all hover:border-blue-500 ${
                                        isSelected
                                            ? 'border-blue-500 ring-2 ring-blue-300 bg-blue-50'
                                            : 'border-gray-300 bg-white'
                                    }`}
                                >
                                    <AvatarPreview config={previewConfig} size={120} className="mb-3" />
                                    <span className="text-base text-center font-medium">{variant}</span>
                                </button>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};


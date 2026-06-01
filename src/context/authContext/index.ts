import { create } from 'zustand'
import { api } from '@/lib/api'
import { toast } from 'react-toastify'
import { AxiosError } from 'axios'
import { loadAndApplySettings } from '@/hooks/useSettings'
import type { OnboardingProfile } from '@/services/onboardingApi'
import { getOnboardingStatus } from '@/services/onboardingApi'
import type { Entitlements, PlanCode } from '@/types/entitlements'
import { mergeUserPreservingEntitlements } from '@/types/entitlements'
import { setStoredReferenceCityId } from '@/lib/planReferenceStorage'

export interface AvatarConfig {
    seed?: string;
    flip?: boolean;
    rotate?: number;
    scale?: number;
    radius?: number;
    size?: number;
    backgroundColor?: string[];
    backgroundType?: string[];
    backgroundRotation?: number[];
    translateX?: number;
    translateY?: number;
    clip?: boolean;
    randomizeIds?: boolean;
    beard?: string[];
    beardProbability?: number;
    earrings?: string[];
    earringsColor?: string[];
    earringsProbability?: number;
    eyebrows?: string[];
    eyebrowsColor?: string[];
    eyes?: string[];
    eyesColor?: string[];
    freckles?: string[];
    frecklesColor?: string[];
    frecklesProbability?: number;
    glasses?: string[];
    glassesColor?: string[];
    glassesProbability?: number;
    hair?: string[];
    hairAccessories?: string[];
    hairAccessoriesColor?: string[];
    hairAccessoriesProbability?: number;
    hairColor?: string[];
    head?: string[];
    mouth?: string[];
    mouthColor?: string[];
    nose?: string[];
    noseColor?: string[];
    skinColor?: string[];
    /** Moldura ao redor do avatar: none | gold | silver | bronze | gradient */
    frame?: string;
}

export interface User {
    id: string,
    name: string,
    email: string,
    role: string,
    tenant_id: string,
    city_id?: string,
    registration: string,
    created_at: string,
    updated_at: string,
    phone: string,
    address: string,
    gender: string,
    nationality: string,
    birth_date: string,
    avatar_config?: AvatarConfig | null,
    traits?: string[],
    competition_band?: string | null,
    /** IDs das molduras compradas na loja (ex: ['gold', 'silver']) */
    owned_frames?: string[],
    city_slug?: string,
    plan_code?: PlanCode,
    entitlements?: Entitlements,
}

interface ApiError {
    erro?: string;
    error?: string;
    message?: string;
}

interface AuthContext {
    user: User,
    loading: boolean,
    needsOnboarding: boolean,
    onboardingProfile: OnboardingProfile | null,
    login: (registration: string, password: string) => Promise<any>,
    autoLogin: () => Promise<any>,
    logout: () => Promise<void>,
    setUser: (user: User) => void,
    setOnboardingComplete: (user: User) => void,
    persistUser: () => Promise<boolean>,
    updateAvatarConfig: (config: AvatarConfig) => Promise<void>,
    addOwnedFrame: (frameId: string) => Promise<void>,
    fetchUserDetails: (userId: string) => Promise<void>,
}

export const useAuth = create<AuthContext>((set, get) => ({
    loading: false,
    needsOnboarding: false,
    onboardingProfile: null,
    user: {
        id: '',
        name: '',
        registration: '',
        email: '',
        role: '',
        tenant_id: '',
        created_at: '',
        updated_at: '',
        phone: '',
        address: '',
        gender: '',
        nationality: '',
        birth_date: '',
        avatar_config: null,
    },
    setUser: (user) => {
        set({ user })
        localStorage.setItem('user', JSON.stringify(user))
    },
    setOnboardingComplete: (user) => {
        set({ needsOnboarding: false, onboardingProfile: null, user })
        localStorage.setItem('user', JSON.stringify(user))
    },
    fetchUserDetails: async (userId: string) => {
        if (!userId) {
            return;
        }

        try {
            const response = await api.get(`/users/${userId}`);
            const detailedUser = response.data?.user ?? response.data;
            if (detailedUser) {
                set((state) => ({
                    user: mergeUserPreservingEntitlements(state.user, detailedUser),
                }));
                localStorage.setItem('user', JSON.stringify(get().user));
            }
        } catch (error) {
            console.error('Erro ao buscar detalhes completos do usuário:', error);
        }
    },
    autoLogin: async () => {
        set({ loading: true })
        try {
            const response = await api.post("/login/", {
                registration: "moises@afirmeplay.com.br",
                password: "12345678"
            })

            toast.success("Login automático realizado com sucesso!");

            localStorage.setItem('token', response.data.token)

            // ✅ CORRIGIDO: Usar a instância da API corretamente
            api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`
            set({ user: response.data.user })
            localStorage.setItem('user', JSON.stringify(response.data.user))

            if (response.data.user?.id) {
                await loadAndApplySettings(response.data.user.id);
                await get().fetchUserDetails(response.data.user.id);
                try {
                    const status = await getOnboardingStatus();
                    set({ needsOnboarding: status.needs_onboarding === true, onboardingProfile: status.profile ?? null });
                } catch {
                    set({ needsOnboarding: false, onboardingProfile: null });
                }
            }

            return response;
        } catch (error: unknown) {
            console.error("Erro no login automático:", error);
            const axiosError = error as AxiosError<ApiError>;

            // ✅ CORRIGIDO: Melhorar tratamento de erros de CORS
            if (axiosError.code === 'ERR_NETWORK') {
                toast.error("Erro de conexão com o servidor. Verifique se o backend está rodando em http://localhost:5000");
            } else {
                const errorMessage = axiosError.response?.data?.erro || axiosError.response?.data?.error || "Erro ao autenticar!";
                toast.error(errorMessage);
            }
            throw error;
        } finally {
            set({ loading: false })
        }
    },
    login: async (registration: string, password: string) => {
        set({ loading: true })
        try {
            const response = await api.post("/login/", { registration, password })

            toast.success("Login realizado com sucesso!", {
                autoClose: 3000, // 3 segundos para sucesso
            });
            localStorage.setItem('token', response.data.token)

            // ✅ CORRIGIDO: Usar a instância da API corretamente
            api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`

            set({ user: response.data.user })
            localStorage.setItem('user', JSON.stringify(response.data.user))

            if (response.data.user?.id) {
                await loadAndApplySettings(response.data.user.id);
                await get().fetchUserDetails(response.data.user.id);
                try {
                    const status = await getOnboardingStatus();
                    set({ needsOnboarding: status.needs_onboarding === true, onboardingProfile: status.profile ?? null });
                } catch {
                    set({ needsOnboarding: false, onboardingProfile: null });
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            return response;
        } catch (error: unknown) {
            console.error("Erro no login:", error);
            // Removido o toast automático para evitar duplicação
            // O componente de Login agora trata os erros especificamente
            throw error;
        } finally {
            set({ loading: false })
        }
    },
    logout: async () => {
        try {
            await api.post("/logout/")
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            setStoredReferenceCityId(null)
            
            // ✅ Limpar filtros das páginas de resultados ao fazer logout
            sessionStorage.removeItem('results_filters')
            sessionStorage.removeItem('answer_sheet_results_filters')

            // ✅ CORRIGIDO: Usar a instância da API corretamente
            delete api.defaults.headers.common['Authorization']

            // Resetar tema, fonte e tamanho de fonte para padrões no DOM apenas
            // NÃO limpar localStorage - as configurações devem permanecer salvas para quando o usuário fizer login novamente
            try {
                document.documentElement.classList.remove('dark');
                document.documentElement.style.setProperty('--app-font-family', 'Inter');
                document.documentElement.style.setProperty('--app-font-size', '100%');
                if (document.body) {
                    document.body.style.fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif';
                    document.body.style.fontSize = '100%';
                }
            } catch (error) {
                console.warn("Erro ao resetar estilos:", error);
            }

                set({
                user: {
                    id: '',
                    name: '',
                    registration: '',
                    email: '',
                    role: '',
                    tenant_id: '',
                    created_at: '',
                    updated_at: '',
                    phone: '',
                    address: '',
                    gender: '',
                    nationality: '',
                    birth_date: '',
                    avatar_config: null,
                },
                needsOnboarding: false,
                onboardingProfile: null,
            })
            window.location.href = '/';
        } catch (error: unknown) {
            console.error("Erro no logout:", error);
            toast.error("Não foi possível deslogar");
        }
    },
    persistUser: async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                return false;
            }

            // ✅ CORRIGIDO: Usar a instância da API corretamente
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

            const response = await api.get('/persist-user/');
            if (response.data) {
                const persistedUser = response.data.user ?? response.data;
                const needsOnboarding = response.data.needs_onboarding === true;
                const onboardingProfile = response.data.profile ?? null;

                if (response.data.token) {
                    localStorage.setItem('token', response.data.token);
                    api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
                }

                if (persistedUser) {
                    set((state) => ({
                        user: mergeUserPreservingEntitlements(state.user, persistedUser),
                        needsOnboarding,
                        onboardingProfile,
                    }));
                    localStorage.setItem('user', JSON.stringify(get().user));

                    const targetId = persistedUser.id;
                    if (targetId) {
                        await loadAndApplySettings(targetId);
                        await get().fetchUserDetails(targetId);
                    }
                    return true;
                }
            }
            return false;
        } catch (error: unknown) {
            console.error('Erro ao persistir usuário:', error);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            delete api.defaults.headers.common['Authorization'];
            return false;
        }
    },
    updateAvatarConfig: async (config: AvatarConfig) => {
        try {
            const currentUser = get().user;
            if (!currentUser.id) {
                throw new Error('Usuário não autenticado');
            }

            const response = await api.put(`/users/${currentUser.id}`, {
                avatar_config: config
            });

            if (response.data && response.data.user) {
                set((state) => ({
                    user: mergeUserPreservingEntitlements(state.user, response.data.user),
                }));
                localStorage.setItem('user', JSON.stringify(get().user));
                toast.success('Avatar atualizado com sucesso!');
            }
        } catch (error: unknown) {
            console.error('Erro ao atualizar avatar:', error);
            const axiosError = error as AxiosError<ApiError>;
            const errorMessage = axiosError.response?.data?.erro || axiosError.response?.data?.error || 'Erro ao atualizar avatar';
            toast.error(errorMessage);
            throw error;
        }
    },
    addOwnedFrame: async (frameId: string) => {
        const currentUser = get().user;
        const current = currentUser.owned_frames ?? [];
        if (current.includes(frameId)) return;
        const next = [...current, frameId];
        set((state) => ({
            user: {
                ...state.user,
                owned_frames: next,
            },
        }));
        localStorage.setItem('user', JSON.stringify(get().user));
        try {
            await api.put(`/users/${currentUser.id}`, {
                owned_frames: next,
            });
        } catch (err) {
            console.error('Erro ao persistir molduras (owned_frames):', err);
            // Mantém no estado local; backend pode não suportar ainda
        }
    },
}))
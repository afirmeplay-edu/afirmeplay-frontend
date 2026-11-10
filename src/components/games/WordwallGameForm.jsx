import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FormMultiSelect } from '@/components/ui/form-multi-select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { api } from '@/lib/api';
import { ExternalLink, Plus, Save, AlertCircle, CheckCircle, Loader2, Users, School, Globe, GraduationCap, BookOpen, X, Check, ChevronsUpDown, MapPin, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGamesCount } from '@/hooks/useGamesCount';
import { useAuth } from '@/context/authContext';
import { EvaluationResultsApiService } from '@/services/evaluation/evaluationResultsApi';
import { getUserHierarchyContext } from '@/utils/userHierarchy';
import { toast } from 'react-toastify';
import { toUserFacingErrorMessage } from '@/utils/userFacingError';

const WordwallGameForm = () => {
    const navigate = useNavigate();
    const { refetch: refetchGamesCount } = useGamesCount();
    const { user } = useAuth();
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [gameData, setGameData] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    // Estados para filtros (Diretor/Coordenador/Admin/Tecadm)
    const [selectedState, setSelectedState] = useState('');
    const [selectedMunicipality, setSelectedMunicipality] = useState('');
    const [selectedSchools, setSelectedSchools] = useState([]); // Array de escolas selecionadas
    const [selectedGrade, setSelectedGrade] = useState('');
    
    // Estados dos popovers
    const [openStateCombo, setOpenStateCombo] = useState(false);
    const [openMunicipalityCombo, setOpenMunicipalityCombo] = useState(false);
    const [openSchoolCombo, setOpenSchoolCombo] = useState(false);
    const [openGradeCombo, setOpenGradeCombo] = useState(false);
    const [openSubjectCombo, setOpenSubjectCombo] = useState(false);
    
    // Estados para dados dos filtros
    const [states, setStates] = useState([]);
    const [municipalities, setMunicipalities] = useState([]);
    const [schools, setSchools] = useState([]);
    const [filteredSchools, setFilteredSchools] = useState([]);
    const [grades, setGrades] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [isLoadingFilters, setIsLoadingFilters] = useState(false);
    const [isLoadingStates, setIsLoadingStates] = useState(false);
    const [isLoadingMunicipalities, setIsLoadingMunicipalities] = useState(false);
    const [isLoadingSchools, setIsLoadingSchools] = useState(false);
    const [isLoadingGrades, setIsLoadingGrades] = useState(false);
    const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
    
    // Estados para preview de vinculação
    const [previewLinkedClasses, setPreviewLinkedClasses] = useState(0);
    const [isCalculatingPreview, setIsCalculatingPreview] = useState(false);
    
    // Estados para seleções múltiplas (diretor/coordenador)
    const [selectedClassIds, setSelectedClassIds] = useState([]);
    const [selectedSchoolIds, setSelectedSchoolIds] = useState([]);
    const [selectedGradeIds, setSelectedGradeIds] = useState([]);
    const [selectedSubject, setSelectedSubject] = useState('');
    
    // Estados para Admin/Tecadm - turmas
    const [selectedClassIdsAdmin, setSelectedClassIdsAdmin] = useState([]);
    const [selectAllClassesAdmin, setSelectAllClassesAdmin] = useState(false);
    const [adminClasses, setAdminClasses] = useState([]);
    
    // Estados para professor
    const [teacherClasses, setTeacherClasses] = useState([]);
    const [isLoadingTeacherClasses, setIsLoadingTeacherClasses] = useState(false);
    
    // Estados para diretor/coordenador
    const [userSchoolId, setUserSchoolId] = useState(null);
    const [userSchoolName, setUserSchoolName] = useState('');
    const [classes, setClasses] = useState([]);

    const validateWordwallUrl = (url) => {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname === 'wordwall.net';
        } catch {
            return false;
        }
    };

    const fetchGamePreview = async (gameUrl) => {
        try {
            const encodedUrl = encodeURIComponent(gameUrl);
            const response = await fetch(`https://wordwall.net/api/oembed?url=${encodedUrl}&format=json`);

            if (!response.ok) {
                throw new Error('Jogo não encontrado ou privado');
            }

            const data = await response.json();
            return data;
        } catch (error) {
            throw new Error('Erro ao buscar informações do jogo');
        }
    };

    const handleUrlChange = async (e) => {
        const newUrl = e.target.value;
        setUrl(newUrl);
        setError('');
        setSuccess('');
        setGameData(null);

        if (newUrl.trim()) {
            if (!validateWordwallUrl(newUrl)) {
                setError('Por favor, insira uma URL válida do Wordwall (wordwall.net)');
                return;
            }

            setIsLoading(true);
            try {
                const data = await fetchGamePreview(newUrl);
                setGameData(data);
            } catch (error) {
                setError(toUserFacingErrorMessage(error, 'Não foi possível carregar o preview do Wordwall.'));
            } finally {
                setIsLoading(false);
            }
        }
    };

    // Carregar turmas do professor
    const loadTeacherClasses = useCallback(async () => {
        if (user?.role !== 'professor' || !user?.id) return;
        
        setIsLoadingTeacherClasses(true);
        try {
            const response = await api.get(`/teacher/${user.id}`);
            const teacherData = response.data;
            
            if (teacherData.turmas && Array.isArray(teacherData.turmas)) {
                setTeacherClasses(teacherData.turmas.map((turma) => ({
                    id: turma.id,
                    name: turma.name || turma.nome || `Turma ${turma.id}`,
                    grade: turma.grade_name || turma.grade?.name || turma.grade?.nome || 'Série não informada'
                })));
            } else {
                setTeacherClasses([]);
            }
        } catch (error) {
            console.error('Erro ao carregar turmas do professor:', error);
            setTeacherClasses([]);
        } finally {
            setIsLoadingTeacherClasses(false);
        }
    }, [user]);

    // Carregar escola do diretor/coordenador
    const loadUserSchool = useCallback(async () => {
        if (!['diretor', 'coordenador'].includes(user?.role) || !user?.id) return;
        
        try {
            const context = await getUserHierarchyContext(user.id, user.role);
            if (context.school) {
                setUserSchoolId(context.school.id);
                setUserSchoolName(context.school.name);
                const school = { id: context.school.id, name: context.school.name, city_id: context.school.id };
                setSelectedSchools([school]);
            }
        } catch (error) {
            console.error('Erro ao carregar escola do usuário:', error);
        }
    }, [user]);

    // Funções para gerenciar escolas (similar ao Play TV)
    const handleToggleSchool = (school) => {
        const isSelected = selectedSchools.some(s => s.id === school.id);
        if (isSelected) {
            setSelectedSchools(selectedSchools.filter(s => s.id !== school.id));
        } else {
            setSelectedSchools([...selectedSchools, school]);
        }
    };

    const handleRemoveSchool = (schoolId) => {
        setSelectedSchools(selectedSchools.filter(s => s.id !== schoolId));
    };

    // Funções para seleção de turmas (Admin/Tecadm)
    const handleSelectAllClassesAdmin = () => {
        if (selectAllClassesAdmin) {
            // Desselecionar todas
            setSelectedClassIdsAdmin([]);
            setSelectAllClassesAdmin(false);
        } else {
            // Selecionar todas
            const allClassIds = adminClasses.map(c => c.id);
            setSelectedClassIdsAdmin(allClassIds);
            setSelectAllClassesAdmin(true);
        }
    };

    const handleToggleClassAdmin = (classId) => {
        const isSelected = selectedClassIdsAdmin.includes(classId);
        if (isSelected) {
            const newSelection = selectedClassIdsAdmin.filter(id => id !== classId);
            setSelectedClassIdsAdmin(newSelection);
            setSelectAllClassesAdmin(false);
        } else {
            const newSelection = [...selectedClassIdsAdmin, classId];
            setSelectedClassIdsAdmin(newSelection);
            // Verificar se todas estão selecionadas
            if (newSelection.length === adminClasses.length) {
                setSelectAllClassesAdmin(true);
            }
        }
    };

    // Função para selecionar todas as turmas (Diretor/Coordenador)
    const handleSelectAllClasses = () => {
        if (classes.length === 0) return;
        
        if (selectedClassIds.length === classes.length) {
            // Desselecionar todas
            setSelectedClassIds([]);
        } else {
            // Selecionar todas
            const allClassIds = classes.map(c => c.id);
            setSelectedClassIds(allClassIds);
        }
    };

    // Carregar disciplinas
    useEffect(() => {
        const loadSubjects = async () => {
            try {
                setIsLoadingSubjects(true);
                const response = await api.get('/subjects');
                setSubjects(response.data || []);
            } catch (error) {
                console.error('Erro ao carregar disciplinas:', error);
                setSubjects([]);
            } finally {
                setIsLoadingSubjects(false);
            }
        };
        
        loadSubjects();
    }, []);

    // Carregar estados
    useEffect(() => {
        const loadStates = async () => {
            if (!['admin', 'tecadm'].includes(user?.role)) return;
            
            try {
                setIsLoadingStates(true);
                const statesData = await EvaluationResultsApiService.getFilterStates();
                if (Array.isArray(statesData) && statesData.length > 0) {
                    setStates(statesData.map(state => ({
                        id: state.id,
                        nome: state.nome
                    })));
                } else {
                    setStates([]);
                }
            } catch (error) {
                console.error('Erro ao carregar estados:', error);
                setStates([]);
            } finally {
                setIsLoadingStates(false);
            }
        };
        
        loadStates();
    }, [user?.role]);

    // Carregar municípios
    useEffect(() => {
        const loadMunicipalities = async () => {
            if (!selectedState || !['admin', 'tecadm'].includes(user?.role)) {
                setMunicipalities([]);
                return;
            }
            
            try {
                setIsLoadingMunicipalities(true);
                const municipalitiesData = await EvaluationResultsApiService.getFilterMunicipalities(selectedState);
                setMunicipalities(municipalitiesData.map(m => ({
                    id: m.id,
                    nome: m.nome
                })));
                setSelectedMunicipality('');
                setSelectedSchools([]);
                setSelectedGrade('');
                setFilteredSchools([]);
            } catch (error) {
                console.error('Erro ao carregar municípios:', error);
            } finally {
                setIsLoadingMunicipalities(false);
            }
        };
        
        loadMunicipalities();
    }, [selectedState, user?.role]);

    // Carregar escolas
    useEffect(() => {
        const loadSchools = async () => {
            // Para diretor/coordenador, usar escola do usuário
            if (['diretor', 'coordenador'].includes(user?.role)) {
                if (userSchoolId) {
                    const school = { id: userSchoolId, name: userSchoolName, city_id: userSchoolId };
                    setSchools([school]);
                    setFilteredSchools([school]);
                    setSelectedSchools([school]);
                }
                return;
            }
            
            // Para admin/tecadm
            if (!selectedMunicipality) {
                setSchools([]);
                setFilteredSchools([]);
                setSelectedSchools([]);
                return;
            }
            
            try {
                setIsLoadingSchools(true);
                const response = await api.get(`/school/city/${selectedMunicipality}`);
                const allSchoolsData = response.data?.schools || response.data || [];
                
                const schoolsData = allSchoolsData.map(s => ({
                    id: s.id,
                    name: s.name || s.nome || `Escola ${s.id}`,
                    city_id: selectedMunicipality
                }));
                
                setSchools(schoolsData);
                setFilteredSchools(schoolsData);
                setSelectedSchools([]);
            } catch (error) {
                console.error('Erro ao carregar escolas:', error);
                setSchools([]);
                setFilteredSchools([]);
            } finally {
                setIsLoadingSchools(false);
            }
        };
        
        loadSchools();
    }, [selectedMunicipality, user?.role, userSchoolId, userSchoolName]);

    // Carregar séries
    useEffect(() => {
        const loadGrades = async () => {
            // Para diretor/coordenador, usar escola do usuário
            if (['diretor', 'coordenador'].includes(user?.role)) {
                if (!userSchoolId) {
                    setGrades([]);
                    return;
                }
                
                try {
                    setIsLoadingGrades(true);
                    const classesResponse = await api.get(`/classes/school/${userSchoolId}`);
                    const classesData = Array.isArray(classesResponse.data) 
                        ? classesResponse.data 
                        : (classesResponse.data?.data || []);
                    
                    const gradeMap = new Map();
                    classesData.forEach((classItem) => {
                        const grade = classItem.grade;
                        if (grade && grade.id && !gradeMap.has(grade.id)) {
                            gradeMap.set(grade.id, {
                                id: grade.id,
                                name: grade.name || grade.nome || ''
                            });
                        }
                    });
                    
                    setGrades(Array.from(gradeMap.values()));
                } catch (error) {
                    console.error('Erro ao carregar séries:', error);
                    setGrades([]);
                } finally {
                    setIsLoadingGrades(false);
                }
                return;
            }
            
            // Para admin/tecadm - carregar séries das escolas selecionadas
            if (['admin', 'tecadm'].includes(user?.role)) {
                if (selectedSchools.length === 0) {
                    setGrades([]);
                    setSelectedGrade('');
                    return;
                }
                
                const schoolsToLoad = selectedSchools.map(s => s.id);
                
                try {
                    setIsLoadingGrades(true);
                    // Carregar séries para todas as escolas selecionadas
                    const allGradesById = new Map();
                    const allGradesByName = new Map();
                    
                    for (const schoolId of schoolsToLoad) {
                        try {
                            // Buscar classes da escola para extrair as séries
                            const classesResponse = await api.get(`/classes/school/${schoolId}`);
                            const classesData = Array.isArray(classesResponse.data) 
                                ? classesResponse.data 
                                : (classesResponse.data?.data || []);
                            
                            // Extrair séries únicas das classes
                            classesData.forEach((classItem) => {
                                const grade = classItem.grade;
                                if (grade && grade.id) {
                                    const gradeName = (grade.name || grade.nome || '').trim();
                                    const normalizedName = gradeName.toLowerCase().trim();
                                    
                                    if (!allGradesById.has(grade.id) && !allGradesByName.has(normalizedName)) {
                                        allGradesById.set(grade.id, {
                                            id: grade.id,
                                            name: gradeName
                                        });
                                        allGradesByName.set(normalizedName, grade.id);
                                    }
                                }
                            });
                        } catch (error) {
                            console.error(`Erro ao carregar séries da escola ${schoolId}:`, error);
                        }
                    }
                    
                    // Converter para array e ordenar por nome
                    const uniqueGrades = Array.from(allGradesById.values()).sort((a, b) => 
                        a.name.localeCompare(b.name)
                    );
                    
                    setGrades(uniqueGrades);
                } catch (error) {
                    console.error('Erro ao carregar séries:', error);
                    setGrades([]);
                } finally {
                    setIsLoadingGrades(false);
                }
                return;
            }
            
            setGrades([]);
        };
        
        loadGrades();
    }, [selectedSchools, user?.role, userSchoolId]);
    
    // Calcular preview de turmas vinculadas
    useEffect(() => {
        const calculatePreview = async () => {
            if (user?.role === 'professor') {
                setPreviewLinkedClasses(teacherClasses.length);
                return;
            }
            
            setIsCalculatingPreview(true);
            try {
                let totalClasses = 0;
                
                // Para Admin/Tecadm
                if (['admin', 'tecadm'].includes(user?.role)) {
                    if (selectedClassIdsAdmin.length > 0) {
                        // Turmas específicas selecionadas
                        totalClasses = selectedClassIdsAdmin.length;
                    } else if (selectedGrade && selectedSchools.length > 0) {
                        // Todas as turmas da série nas escolas selecionadas
                        for (const school of selectedSchools) {
                            try {
                                const classesResponse = await api.get(`/classes/school/${school.id}`);
                                const classesData = Array.isArray(classesResponse.data) 
                                    ? classesResponse.data 
                                    : (classesResponse.data?.data || []);
                                
                                const classesForGrade = classesData.filter((c) => {
                                    const gradeId = c.grade_id || c.grade?.id;
                                    return String(gradeId) === String(selectedGrade);
                                });
                                
                                totalClasses += classesForGrade.length;
                            } catch (error) {
                                console.error(`Erro ao buscar turmas da escola ${school.id}:`, error);
                            }
                        }
                    }
                } else {
                    // Para Diretor/Coordenador
                    // Contar turmas selecionadas diretamente
                    totalClasses += selectedClassIds.length;
                    
                    // Para séries selecionadas, buscar turmas dessas séries
                    if (selectedGradeIds.length > 0) {
                        const schoolIdsToCheck = ['diretor', 'coordenador'].includes(user?.role) 
                            ? [userSchoolId] 
                            : (selectedSchoolIds.length > 0 ? selectedSchoolIds : (selectedSchools.length > 0 ? selectedSchools.map(s => s.id) : [])).filter(Boolean);
                        
                        for (const schoolId of schoolIdsToCheck) {
                            if (!schoolId) continue;
                            try {
                                const classesResponse = await api.get(`/classes/school/${schoolId}`);
                                const classesData = Array.isArray(classesResponse.data) 
                                    ? classesResponse.data 
                                    : (classesResponse.data?.data || []);
                                
                                const classesForGrades = classesData.filter((c) => {
                                    const gradeId = c.grade_id || c.grade?.id;
                                    return selectedGradeIds.includes(gradeId);
                                });
                                
                                totalClasses += classesForGrades.length;
                            } catch (error) {
                                console.error(`Erro ao buscar turmas da escola ${schoolId}:`, error);
                            }
                        }
                    }
                }
                
                setPreviewLinkedClasses(totalClasses);
            } catch (error) {
                console.error('Erro ao calcular preview:', error);
                setPreviewLinkedClasses(0);
            } finally {
                setIsCalculatingPreview(false);
            }
        };
        
        calculatePreview();
    }, [selectedClassIds, selectedSchoolIds, selectedGradeIds, selectedSchools, selectedGrade, selectedClassIdsAdmin, user?.role, userSchoolId, teacherClasses.length]);

    // Carregar turmas para seleção múltipla (Diretor/Coordenador)
    useEffect(() => {
        const loadClasses = async () => {
            // Para diretor/coordenador, carregar turmas da escola
            if (['diretor', 'coordenador'].includes(user?.role)) {
                if (!userSchoolId) {
                    setClasses([]);
                    return;
                }
                
                try {
                    setIsLoadingFilters(true);
                    const classesResponse = await api.get(`/classes/school/${userSchoolId}`);
                    const classesData = Array.isArray(classesResponse.data) 
                        ? classesResponse.data 
                        : (classesResponse.data?.data || []);
                    
                    setClasses(classesData.map((c) => ({
                        id: c.id,
                        name: c.name || c.nome || `Turma ${c.id}`,
                        grade_id: c.grade_id || c.grade?.id,
                        grade_name: c.grade?.name || c.grade?.nome || ''
                    })));
                } catch (error) {
                    console.error('Erro ao carregar turmas:', error);
                    setClasses([]);
                } finally {
                    setIsLoadingFilters(false);
                }
                return;
            }
            
            setClasses([]);
        };
        
        loadClasses();
    }, [selectedSchools, selectedSchoolIds, selectedGradeIds, user?.role, userSchoolId]);

    // Carregar turmas para Admin/Tecadm
    useEffect(() => {
        const loadAdminClasses = async () => {
            if (!['admin', 'tecadm'].includes(user?.role)) {
                setAdminClasses([]);
                setSelectedClassIdsAdmin([]);
                setSelectAllClassesAdmin(false);
                return;
            }

            if (selectedSchools.length === 0 || !selectedGrade) {
                setAdminClasses([]);
                setSelectedClassIdsAdmin([]);
                setSelectAllClassesAdmin(false);
                return;
            }

            try {
                setIsLoadingFilters(true);
                const allClasses = [];
                
                // Carregar turmas de todas as escolas selecionadas filtradas pela série
                for (const school of selectedSchools) {
                    try {
                        const classesResponse = await api.get(`/classes/school/${school.id}`);
                        const classesData = Array.isArray(classesResponse.data) 
                            ? classesResponse.data 
                            : (classesResponse.data?.data || []);
                        
                        // Filtrar por série selecionada
                        const filteredClasses = classesData
                            .filter((c) => {
                                const gradeId = c.grade_id || c.grade?.id;
                                return String(gradeId) === String(selectedGrade);
                            })
                            .map((c) => ({
                                id: c.id,
                                name: c.name || c.nome || `Turma ${c.id}`,
                                school_id: school.id,
                                school_name: school.name,
                                grade_id: c.grade_id || c.grade?.id,
                                grade_name: c.grade?.name || c.grade?.nome || ''
                            }));
                        
                        allClasses.push(...filteredClasses);
                    } catch (error) {
                        console.error(`Erro ao carregar turmas da escola ${school.id}:`, error);
                    }
                }
                
                setAdminClasses(allClasses);
                // Limpar seleção quando as turmas mudarem
                setSelectedClassIdsAdmin([]);
                setSelectAllClassesAdmin(false);
            } catch (error) {
                console.error('Erro ao carregar turmas:', error);
                setAdminClasses([]);
            } finally {
                setIsLoadingFilters(false);
            }
        };
        
        loadAdminClasses();
    }, [selectedSchools, selectedGrade, user?.role]);

    // Sincronizar estado "Selecionar Todas" quando a seleção mudar
    useEffect(() => {
        if (adminClasses.length > 0) {
            const allSelected = selectedClassIdsAdmin.length === adminClasses.length && adminClasses.length > 0;
            setSelectAllClassesAdmin(allSelected);
        } else {
            setSelectAllClassesAdmin(false);
        }
    }, [selectedClassIdsAdmin, adminClasses]);

    // Carregar dados iniciais baseado na role
    useEffect(() => {
        if (user?.role === 'professor') {
            loadTeacherClasses();
        } else if (['diretor', 'coordenador'].includes(user?.role)) {
            loadUserSchool();
        }
    }, [user?.role, loadTeacherClasses, loadUserSchool]);

    // Variáveis para exibir nomes selecionados (igual ao Play TV)
    const selectedGradeData = selectedGrade && Array.isArray(grades) && grades.length > 0 
        ? grades.find(g => g.id === selectedGrade) 
        : null;
    const selectedSubjectData = selectedSubject && Array.isArray(subjects) && subjects.length > 0 
        ? subjects.find(s => s.id === selectedSubject) 
        : null;

    // Validar campos obrigatórios
    const validateForm = () => {
        if (!gameData) {
            setError('Por favor, insira uma URL válida do Wordwall');
            return false;
        }
        
        // Validação de disciplina (obrigatória para todos)
        if (!selectedSubject) {
            setError('Por favor, selecione uma disciplina.');
            return false;
        }
        
        // Validações por role
        if (user?.role === 'professor') {
            if (teacherClasses.length === 0) {
                setError('Você não possui turmas vinculadas. Vincule-se a uma turma primeiro.');
                return false;
            }
        } else if (['diretor', 'coordenador'].includes(user?.role)) {
            // Deve ter pelo menos turmas OU séries selecionadas
            if (selectedClassIds.length === 0 && selectedGradeIds.length === 0) {
                setError('Por favor, selecione pelo menos uma turma ou uma série.');
                return false;
            }
        } else if (['admin', 'tecadm'].includes(user?.role)) {
            // Deve ter estado, município, escolas e série selecionados
            if (!selectedState) {
                setError('Por favor, selecione um estado.');
                return false;
            }
            if (!selectedMunicipality) {
                setError('Por favor, selecione um município.');
                return false;
            }
            if (selectedSchools.length === 0) {
                setError('Por favor, selecione pelo menos uma escola.');
                return false;
            }
            if (!selectedGrade) {
                setError('Por favor, selecione uma série.');
                return false;
            }
            // Turmas são obrigatórias - deve selecionar pelo menos uma turma específica
            if (selectedClassIdsAdmin.length === 0) {
                setError('Por favor, selecione pelo menos uma turma.');
                return false;
            }
        }
        
        return true;
    };

    const handleSaveGame = async () => {
        if (!gameData) return;
        
        if (!validateForm()) {
            return;
        }

        // Validação adicional para garantir que a disciplina está selecionada
        if (!selectedSubject) {
            setError('Por favor, selecione uma disciplina.');
            return;
        }

        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            // Obter nome da disciplina selecionada
            const subjectName = selectedSubjectData?.name || selectedSubjectData?.nome || selectedSubject;
            
            const gamePayload = {
                url: url,
                title: gameData.title || 'Jogo Wordwall',
                iframeHtml: gameData.html,
                thumbnail: gameData.thumbnail_url,
                author: gameData.author_name,
                provider: 'wordwall',
                subject: subjectName, // Nome da disciplina (campo obrigatório do backend)
            };
            
            // Adicionar campos de vinculação baseado na role
            if (user?.role === 'professor') {
                // Não enviar class_ids - será vinculado automaticamente
            } else if (['diretor', 'coordenador'].includes(user?.role)) {
                // Enviar arrays de turmas e/ou séries
                if (selectedClassIds.length > 0) {
                    gamePayload.class_ids = selectedClassIds;
                }
                if (selectedGradeIds.length > 0) {
                    gamePayload.grade_ids = selectedGradeIds;
                }
            } else if (['admin', 'tecadm'].includes(user?.role)) {
                // Turmas são obrigatórias - sempre enviar class_ids das turmas selecionadas
                gamePayload.class_ids = selectedClassIdsAdmin;
            }

            await api.post('/games', gamePayload);
            setSuccess('Jogo salvo com sucesso!');
            setUrl('');
            setGameData(null);
            
            // Limpar filtros
            setSelectedState('');
            setSelectedMunicipality('');
            setSelectedSchools([]);
            setSelectedGrade('');
            setSelectedSubject('');
            setSelectedClassIds([]);
            setSelectedGradeIds([]);
            setSelectedClassIdsAdmin([]);
            setSelectAllClassesAdmin(false);

            // Atualizar contador no sidebar
            refetchGamesCount();

            // Redirecionar para a página de jogos após 2 segundos
            setTimeout(() => {
                navigate('/app/jogos');
            }, 2000);
        } catch (error) {
            // Tratar erros múltiplos se existirem
            const errorData = error.response?.data;
            let errorMessage = errorData?.erro || errorData?.error || 'Erro ao salvar o jogo. Tente novamente.';
            
            // Se houver detalhes de erro, adicionar à mensagem
            if (errorData?.detalhes && Array.isArray(errorData.detalhes) && errorData.detalhes.length > 0) {
                errorMessage += '\n\nDetalhes:\n' + errorData.detalhes.map((d, i) => `${i + 1}. ${d}`).join('\n');
            }
            
            setError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateGame = () => {
        window.open('https://wordwall.net/pt-br/create', '_blank');
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button onClick={handleCreateGame} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Criar Jogo no Wordwall
                    <ExternalLink className="w-4 h-4" />
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Adicionar Jogo Existente</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="game-url" className="text-sm font-medium">
                            URL do Jogo Wordwall
                        </label>
                        <Input
                            id="game-url"
                            type="url"
                            placeholder="https://wordwall.net/pt/resource/94433702/roleta"
                            value={url}
                            onChange={handleUrlChange}
                            disabled={isLoading}
                        />
                    </div>

                    {/* Seção para Professor */}
                    {user?.role === 'professor' && (
                        <>
                            <div className="space-y-4 p-4 bg-muted rounded-lg border border-border">
                                <div className="flex items-start gap-2">
                                    <AlertCircle className="h-5 w-5 text-foreground mt-0.5 flex-shrink-0" />
                                    <div className="flex-1">
                                        <h4 className="font-medium text-foreground mb-1">
                                            Vinculação Automática
                                        </h4>
                                        <p className="text-sm text-muted-foreground mb-3">
                                            Este jogo será vinculado automaticamente às suas turmas.
                                        </p>
                                        {isLoadingTeacherClasses ? (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Carregando suas turmas...
                                            </div>
                                        ) : teacherClasses.length > 0 ? (
                                            <div className="space-y-2">
                                                <p className="text-sm font-medium text-foreground">
                                                    Suas turmas:
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {teacherClasses.map((turma) => (
                                                        <Badge key={turma.id} variant="secondary" className="text-xs">
                                                            {turma.name} ({turma.grade})
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-red-600 dark:text-red-400">
                                                Você não possui turmas vinculadas. Vincule-se a uma turma primeiro.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Campo de Disciplina para Professor */}
                            <div className="space-y-2">
                                <Label>
                                    Disciplina <span className="text-red-500">*</span>
                                </Label>
                                <Popover open={openSubjectCombo} onOpenChange={setOpenSubjectCombo}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openSubjectCombo}
                                            className="w-full justify-between"
                                            disabled={isLoadingSubjects}
                                        >
                                            {selectedSubject && selectedSubjectData
                                                ? (selectedSubjectData.name || selectedSubjectData.nome)
                                                : "Selecione uma disciplina..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[400px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Buscar disciplina..." />
                                            <CommandEmpty>Nenhuma disciplina encontrada.</CommandEmpty>
                                            <CommandGroup className="max-h-[200px] overflow-auto">
                                                {Array.isArray(subjects) && subjects.length > 0 ? (
                                                    subjects.map((subject) => (
                                                        <CommandItem
                                                            key={subject.id}
                                                            value={subject.name || subject.nome}
                                                            onSelect={() => {
                                                                setSelectedSubject(subject.id);
                                                                setOpenSubjectCombo(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    selectedSubject === subject.id ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                                                            <span>{subject.name || subject.nome}</span>
                                                        </CommandItem>
                                                    ))
                                                ) : (
                                                    <CommandEmpty>Nenhuma disciplina disponível</CommandEmpty>
                                                )}
                                            </CommandGroup>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </>
                    )}

                    {/* Seção para Diretor/Coordenador */}
                    {['diretor', 'coordenador'].includes(user?.role) && (
                        <div className="space-y-4 p-4 bg-muted rounded-lg border border-border">
                            <div className="flex items-start gap-2">
                                <School className="h-5 w-5 text-foreground mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                    <h4 className="font-medium text-foreground mb-1">
                                        Vincular Jogo
                                    </h4>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        Selecione turmas específicas e/ou séries para vincular este jogo.
                                    </p>
                                    
                                    <div className="space-y-4">
                                        {/* Escola (somente leitura) */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">
                                                Escola
                                            </label>
                                            <Input
                                                value={userSchoolName || 'Carregando...'}
                                                disabled
                                                className="bg-muted"
                                            />
                                        </div>
                                        
                                        {/* Seleção múltipla de Séries */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">
                                                Séries <span className="text-muted-foreground">(opcional)</span>
                                            </label>
                                            <p className="text-xs text-muted-foreground mb-2">
                                                Selecione uma ou mais séries. Todas as turmas dessas séries serão vinculadas.
                                            </p>
                                            <FormMultiSelect
                                                options={grades.map(grade => ({ id: grade.id, name: grade.name }))}
                                                selected={selectedGradeIds}
                                                onChange={setSelectedGradeIds}
                                                placeholder={selectedGradeIds.length === 0 ? "Selecione séries (opcional)" : `${selectedGradeIds.length} selecionada(s)`}
                                                disabled={isLoadingFilters}
                                            />
                                        </div>
                                        
                                        {/* Seleção múltipla de Turmas */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-medium">
                                                    Turmas Específicas <span className="text-muted-foreground">(opcional)</span>
                                                </label>
                                                {classes.length > 0 && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={handleSelectAllClasses}
                                                    >
                                                        {selectedClassIds.length === classes.length ? 'Desselecionar Todas' : 'Selecionar Todas'}
                                                    </Button>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-2">
                                                Selecione uma ou mais turmas específicas para vincular.
                                            </p>
                                            <FormMultiSelect
                                                options={classes.map(classItem => ({ 
                                                    id: classItem.id, 
                                                    name: classItem.grade_name ? `${classItem.name} (${classItem.grade_name})` : classItem.name 
                                                }))}
                                                selected={selectedClassIds}
                                                onChange={setSelectedClassIds}
                                                placeholder={selectedClassIds.length === 0 ? "Selecione turmas (opcional)" : `${selectedClassIds.length} selecionada(s)`}
                                                disabled={isLoadingFilters}
                                            />
                                        </div>

                                        {/* Campo de Disciplina */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">
                                                Disciplina <span className="text-red-500">*</span>
                                            </label>
                                            <Popover open={openSubjectCombo} onOpenChange={setOpenSubjectCombo}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        role="combobox"
                                                        aria-expanded={openSubjectCombo}
                                                        className="w-full justify-between"
                                                        disabled={isLoadingSubjects}
                                                    >
                                                        {selectedSubject && selectedSubjectData
                                                            ? (selectedSubjectData.name || selectedSubjectData.nome)
                                                            : "Selecione uma disciplina..."}
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[400px] p-0">
                                                    <Command>
                                                        <CommandInput placeholder="Buscar disciplina..." />
                                                        <CommandEmpty>Nenhuma disciplina encontrada.</CommandEmpty>
                                                        <CommandGroup className="max-h-[200px] overflow-auto">
                                                            {Array.isArray(subjects) && subjects.length > 0 ? (
                                                                subjects.map((subject) => (
                                                                    <CommandItem
                                                                        key={subject.id}
                                                                        value={subject.name || subject.nome}
                                                                        onSelect={() => {
                                                                            setSelectedSubject(subject.id);
                                                                            setOpenSubjectCombo(false);
                                                                        }}
                                                                    >
                                                                        <Check
                                                                            className={cn(
                                                                                "mr-2 h-4 w-4",
                                                                                selectedSubject === subject.id ? "opacity-100" : "opacity-0"
                                                                            )}
                                                                        />
                                                                        <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                                                                        <span>{subject.name || subject.nome}</span>
                                                                    </CommandItem>
                                                                ))
                                                            ) : (
                                                                <CommandEmpty>Nenhuma disciplina disponível</CommandEmpty>
                                                            )}
                                                        </CommandGroup>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        
                                        {/* Preview */}
                                        {(selectedClassIds.length > 0 || selectedGradeIds.length > 0) && (
                                            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-md border border-amber-300">
                                                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                                                    {isCalculatingPreview ? (
                                                        <span className="flex items-center gap-2">
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            Calculando...
                                                        </span>
                                                    ) : (
                                                        `📊 ${previewLinkedClasses} turma(s) serão vinculadas a este jogo`
                                                    )}
                                                </p>
                                            </div>
                                        )}
                                        
                                        {selectedClassIds.length === 0 && selectedGradeIds.length === 0 && (
                                            <p className="text-xs text-red-600">
                                                Selecione pelo menos uma turma ou uma série
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Seção para Admin/Tecadm */}
                    {['admin', 'tecadm'].includes(user?.role) && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Vincular Jogo</CardTitle>
                                <CardDescription>
                                    Selecione estado, município, escolas, série, disciplina e turmas (opcional) para vincular este jogo
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-6">
                                    {/* Seleção de Estado */}
                                    <div className="space-y-2">
                                        <Label>
                                            Estado <span className="text-red-500">*</span>
                                        </Label>
                                <Popover open={openStateCombo} onOpenChange={setOpenStateCombo}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openStateCombo}
                                            className="w-full justify-between"
                                            disabled={isLoadingStates}
                                        >
                                            {selectedState
                                                ? states.find(state => state.id === selectedState)?.nome
                                                : isLoadingStates
                                                ? "Carregando estados..."
                                                : "Selecione um estado..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[400px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Buscar estado..." />
                                            <CommandEmpty>Nenhum estado encontrado.</CommandEmpty>
                                            <CommandGroup className="max-h-[200px] overflow-auto">
                                                {Array.isArray(states) && states.length > 0 ? (
                                                    states.map((state) => (
                                                        <CommandItem
                                                            key={state.id}
                                                            value={state.nome}
                                                            onSelect={() => {
                                                                setSelectedState(state.id);
                                                                setOpenStateCombo(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    selectedState === state.id ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                                                            <span>{state.nome}</span>
                                                        </CommandItem>
                                                    ))
                                                ) : (
                                                    <CommandEmpty>Nenhum estado encontrado.</CommandEmpty>
                                                )}
                                            </CommandGroup>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Seleção de Município */}
                            <div className="space-y-2">
                                <Label>
                                    Município <span className="text-red-500">*</span>
                                </Label>
                                <Popover open={openMunicipalityCombo} onOpenChange={setOpenMunicipalityCombo}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openMunicipalityCombo}
                                            className="w-full justify-between"
                                            disabled={isLoadingMunicipalities || !selectedState}
                                        >
                                            {selectedMunicipality
                                                ? municipalities.find(municipality => municipality.id === selectedMunicipality)?.nome
                                                : !selectedState
                                                ? "Selecione um estado primeiro..."
                                                : isLoadingMunicipalities
                                                ? "Carregando municípios..."
                                                : "Selecione um município..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[400px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Buscar município..." />
                                            <CommandEmpty>
                                                {!selectedState
                                                    ? "Selecione um estado primeiro"
                                                    : "Nenhum município encontrado para o estado selecionado"}
                                            </CommandEmpty>
                                            <CommandGroup className="max-h-[200px] overflow-auto">
                                                {Array.isArray(municipalities) && municipalities.length > 0 ? (
                                                    municipalities.map((municipality) => (
                                                        <CommandItem
                                                            key={municipality.id}
                                                            value={municipality.nome}
                                                            onSelect={() => {
                                                                setSelectedMunicipality(municipality.id);
                                                                setOpenMunicipalityCombo(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    selectedMunicipality === municipality.id ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                                                            <span>{municipality.nome}</span>
                                                        </CommandItem>
                                                    ))
                                                ) : (
                                                    <CommandEmpty>
                                                        {!selectedState
                                                            ? "Selecione um estado primeiro"
                                                            : "Nenhum município encontrado para o estado selecionado"}
                                                    </CommandEmpty>
                                                )}
                                            </CommandGroup>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Seleção de Escolas */}
                            <div className="space-y-2">
                                <Label>
                                    Escolas <span className="text-red-500">*</span>
                                </Label>
                                <Popover open={openSchoolCombo} onOpenChange={setOpenSchoolCombo}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openSchoolCombo}
                                            className="w-full justify-between"
                                            disabled={isLoadingSchools || !selectedMunicipality}
                                        >
                                            {selectedSchools.length > 0
                                                ? `${selectedSchools.length} escola${selectedSchools.length !== 1 ? 's' : ''} selecionada${selectedSchools.length !== 1 ? 's' : ''}`
                                                : !selectedMunicipality
                                                ? "Selecione um município primeiro..."
                                                : "Selecione as escolas..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[400px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Buscar escola..." />
                                            <CommandEmpty>
                                                {!selectedMunicipality
                                                    ? "Selecione um município primeiro"
                                                    : "Nenhuma escola encontrada para o município selecionado"}
                                            </CommandEmpty>
                                            <CommandGroup className="max-h-[200px] overflow-auto">
                                                {Array.isArray(filteredSchools) && filteredSchools.length > 0 ? (
                                                    filteredSchools.map((school) => (
                                                        <CommandItem
                                                            key={school.id}
                                                            value={school.name}
                                                            onSelect={() => handleToggleSchool(school)}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    selectedSchools.some(s => s.id === school.id) ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            <School className="mr-2 h-4 w-4 text-muted-foreground" />
                                                            <span>{school.name}</span>
                                                        </CommandItem>
                                                    ))
                                                ) : (
                                                    <CommandEmpty>
                                                        {!selectedMunicipality
                                                            ? "Selecione um município primeiro"
                                                            : "Nenhuma escola encontrada para o município selecionado"}
                                                    </CommandEmpty>
                                                )}
                                            </CommandGroup>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                
                                {/* Escolas selecionadas */}
                                {selectedSchools.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {selectedSchools.map((school) => (
                                            <Badge key={school.id} variant="secondary" className="flex items-center gap-1">
                                                {school.name}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSchool(school.id)}
                                                    className="ml-1 hover:bg-destructive hover:text-destructive-foreground rounded-full p-0.5"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                                {!selectedMunicipality && (
                                    <p className="text-xs text-muted-foreground">
                                        Selecione um município para visualizar as escolas disponíveis
                                    </p>
                                )}
                                {selectedSchools.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        As séries serão filtradas pelas escolas selecionadas
                                    </p>
                                )}
                            </div>

                            {/* Seleção de Série */}
                            <div className="space-y-2">
                                <Label>
                                    Série <span className="text-red-500">*</span>
                                </Label>
                                <Popover open={openGradeCombo} onOpenChange={setOpenGradeCombo}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openGradeCombo}
                                            className="w-full justify-between"
                                            disabled={isLoadingGrades || selectedSchools.length === 0}
                                        >
                                            {selectedGrade && selectedGradeData
                                                ? selectedGradeData.name
                                                : selectedSchools.length === 0
                                                ? "Selecione escolas primeiro..."
                                                : isLoadingGrades
                                                ? "Carregando séries..."
                                                : "Selecione uma série..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[400px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Buscar série..." />
                                            <CommandEmpty>
                                                {selectedSchools.length === 0
                                                    ? "Selecione escolas primeiro"
                                                    : "Nenhuma série encontrada para as escolas selecionadas"}
                                            </CommandEmpty>
                                            <CommandGroup className="max-h-[200px] overflow-auto">
                                                {Array.isArray(grades) && grades.length > 0 ? (
                                                    grades.map((grade) => (
                                                        <CommandItem
                                                            key={grade.id}
                                                            value={grade.name}
                                                            onSelect={() => {
                                                                setSelectedGrade(grade.id);
                                                                setOpenGradeCombo(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    selectedGrade === grade.id ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            <GraduationCap className="mr-2 h-4 w-4 text-muted-foreground" />
                                                            <span>{grade.name}</span>
                                                        </CommandItem>
                                                    ))
                                                ) : (
                                                    <CommandEmpty>Nenhuma série disponível</CommandEmpty>
                                                )}
                                            </CommandGroup>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                {selectedSchools.length > 0 && grades.length === 0 && !isLoadingGrades && (
                                    <p className="text-xs text-destructive">
                                        Nenhuma série encontrada para as escolas selecionadas
                                    </p>
                                )}
                            </div>

                            {/* Seleção de Disciplina */}
                            <div className="space-y-2">
                                <Label>
                                    Disciplina <span className="text-red-500">*</span>
                                </Label>
                                <Popover open={openSubjectCombo} onOpenChange={setOpenSubjectCombo}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openSubjectCombo}
                                            className="w-full justify-between"
                                            disabled={isLoadingSubjects}
                                        >
                                            {selectedSubject && selectedSubjectData
                                                ? (selectedSubjectData.name || selectedSubjectData.nome)
                                                : "Selecione uma disciplina..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[400px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Buscar disciplina..." />
                                            <CommandEmpty>Nenhuma disciplina encontrada.</CommandEmpty>
                                            <CommandGroup className="max-h-[200px] overflow-auto">
                                                {Array.isArray(subjects) && subjects.length > 0 ? (
                                                    subjects.map((subject) => (
                                                        <CommandItem
                                                            key={subject.id}
                                                            value={subject.name || subject.nome}
                                                            onSelect={() => {
                                                                setSelectedSubject(subject.id);
                                                                setOpenSubjectCombo(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    selectedSubject === subject.id ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                                                            <span>{subject.name || subject.nome}</span>
                                                        </CommandItem>
                                                    ))
                                                ) : (
                                                    <CommandEmpty>Nenhuma disciplina disponível</CommandEmpty>
                                                )}
                                            </CommandGroup>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Seleção de Turmas para Admin/Tecadm */}
                            {selectedGrade && selectedSchools.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>
                                            Turmas <span className="text-red-500">*</span>
                                        </Label>
                                        {adminClasses.length > 0 && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleSelectAllClassesAdmin}
                                            >
                                                {selectAllClassesAdmin ? 'Desselecionar Todas' : 'Selecionar Todas'}
                                            </Button>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-2">
                                        Selecione uma ou mais turmas específicas para vincular este jogo.
                                    </p>
                                    
                                    {isLoadingFilters ? (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Carregando turmas...
                                        </div>
                                    ) : adminClasses.length > 0 ? (
                                        <div className="border rounded-lg p-3 max-h-60 overflow-y-auto space-y-2">
                                            {adminClasses.map((classItem) => (
                                                <div key={classItem.id} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`admin-class-${classItem.id}`}
                                                        checked={selectedClassIdsAdmin.includes(classItem.id)}
                                                        onCheckedChange={() => handleToggleClassAdmin(classItem.id)}
                                                    />
                                                    <Label
                                                        htmlFor={`admin-class-${classItem.id}`}
                                                        className="flex-1 cursor-pointer text-sm"
                                                    >
                                                        {classItem.name}
                                                        {classItem.school_name && (
                                                            <span className="text-xs text-muted-foreground ml-2">
                                                                - {classItem.school_name}
                                                            </span>
                                                        )}
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground py-2">
                                            Nenhuma turma encontrada para a série selecionada nas escolas escolhidas.
                                        </p>
                                    )}
                                    
                                    {selectedClassIdsAdmin.length > 0 && (
                                        <div className="p-2 bg-muted rounded-md">
                                            <p className="text-xs text-muted-foreground">
                                                {selectedClassIdsAdmin.length} turma(s) selecionada(s)
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Erro</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {success && (
                        <Alert>
                            <CheckCircle className="h-4 w-4" />
                            <AlertTitle>Sucesso</AlertTitle>
                            <AlertDescription>{success}</AlertDescription>
                        </Alert>
                    )}

                    {isLoading && (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <span className="ml-2">Carregando...</span>
                        </div>
                    )}

                    {gameData && !isLoading && (
                        <div className="space-y-4">
                            <div className="border rounded-lg p-4 bg-muted/50">
                                <h4 className="font-medium mb-2">{gameData.title}</h4>
                                {gameData.author_name && (
                                    <p className="text-sm text-muted-foreground mb-3">
                                        Criado por: {gameData.author_name}
                                    </p>
                                )}
                                <div
                                    className="w-full h-64 border rounded overflow-hidden"
                                    dangerouslySetInnerHTML={{ __html: gameData.html }}
                                />
                            </div>

                            <CardFooter className="px-0">
                                <Button
                                    onClick={handleSaveGame}
                                    disabled={isLoading}
                                    className="flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    Salvar Jogo
                                </Button>
                            </CardFooter>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default WordwallGameForm; 
import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, User, KeyRound, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useDataContext } from "@/context/dataContext";
import { useEmailCheck } from "@/hooks/useEmailCheck";

import { ROLE_DISPLAY_MAPPING } from "@/lib/constants";

// Role mapping object (inverso para conversão de volta para o backend)
const roleMapping: { [key: string]: string } = {
  "Administrador": "admin",
  "Professor": "professor",
  "Coordenador": "coordenador",
  "Diretor": "diretor",
  "Técnico Administrador": "tecadm",
  "Aplicador": "aplicador",
  "Aluno": "aluno"
};

// Form validation schema
const createUserFormSchema = (isEditing: boolean) => z.object({
  name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres"),
  email: z.string().email("Email inválido"),
  password: isEditing 
    ? z.string().optional()
    : z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  confirmPassword: isEditing 
    ? z.string().optional()
    : z.string().min(1, "Confirme sua senha"),
  role: z.string().min(1, "Selecione uma função"),
  registration: z.string().nullable(),
  city_id: z.string().nullable(),
}).refine((data) => {
  if (!isEditing) {
    return data.password === data.confirmPassword;
  }
  if (data.password && data.password.length > 0) {
    return data.password === data.confirmPassword;
  }
  return true;
}, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type UserFormValues = {
  name: string;
  email: string;
  password?: string;
  confirmPassword?: string;
  role: string;
  registration?: string | null;
  city_id?: string | null;
  id?: number | string;
};

interface UserFormProps {
  user?: {
    id: number | string;
    name: string;
    email: string;
    role: string;
    registration?: string;
    city_id?: string;
  };
  onSubmit?: (data: UserFormValues) => Promise<void> | void;
  allowedRoles?: string[]; // Roles permitidas para criação (ex: ["Administrador", "Diretor"])
  showCitySelect?: boolean; // Se deve mostrar o campo de seleção de município
  /** Layout "modal" agrupa em seções e usa grid para melhor leitura em modais */
  layout?: "default" | "modal";
  /** Estado de envio controlado pelo pai (ex.: PUT + recarregar lista) */
  isSubmitting?: boolean;
}

export default function UserForm({
  user,
  onSubmit,
  allowedRoles,
  showCitySelect = true,
  layout = "default",
  isSubmitting = false,
}: UserFormProps) {
  const isEditing = !!user;
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { municipios, getMunicipios } = useDataContext();
  
  useEffect(() => {
    getMunicipios();
  }, [getMunicipios]);

  // Set up form with default values
  const form = useForm<UserFormValues>({
    resolver: zodResolver(createUserFormSchema(isEditing)),
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      password: "",
      confirmPassword: "",
      role: user?.role || "",
      registration: user?.registration || null,
      city_id: user?.city_id || null,
    },
  });

  // Watch para mudanças no campo nome (apenas para novos usuários)
  const watchedName = form.watch("name");
  const { checkedEmail, isChecking, isAvailable } = useEmailCheck(watchedName, !isEditing);

  useEffect(() => {
    if (!isEditing && checkedEmail) {
      form.setValue("email", checkedEmail);
    }
  }, [checkedEmail, isEditing, form]);

  // Handle form submission
  const handleSubmit = async (data: UserFormValues) => {
    try {
      setIsLoading(true);
      
      // Convert role to the correct format
      const formattedData = {
        ...data,
        role: roleMapping[data.role] || data.role
      };
      
      // Remove confirmPassword from the data before sending
      const { confirmPassword, ...dataToSend } = formattedData;
      
      // If editing, we don't require the password field and preserve the ID
      if (isEditing) {
        if (!dataToSend.password || dataToSend.password.trim() === "") {
          // If password field is empty during edit, remove it from the data
          const { password, ...dataWithoutPassword } = dataToSend;
          if (onSubmit) {
            await onSubmit({ ...dataWithoutPassword, id: user.id });
          }
        } else {
          // Password was provided during edit
          if (onSubmit) {
            await onSubmit({ ...dataToSend, id: user.id });
          }
        }
      } else {
        // New user - use callback to parent component
        if (onSubmit) {
          await onSubmit(dataToSend);
          // Reset form after successful submission
          form.reset();
        }
      }
    } catch (error) {
      toast.error('Erro ao criar usuário. Por favor, tente novamente.');
      console.error('Error creating user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Transform municipios data for MultiSelect
  const municipioOptions = Array.isArray(municipios) ? municipios.map(municipio => ({
    id: municipio.id.toString(),
    name: municipio.name
  })) : [];

  const isModalLayout = layout === "modal";
  const busy = isLoading || isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className={isModalLayout ? "space-y-6" : "space-y-4"}>
        {/* Seção: Dados cadastrais */}
        {isModalLayout && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-[#7B3FE4]" />
              Dados cadastrais
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Digite o nome completo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="email"
                          placeholder={isEditing ? "nome@escola.edu.br" : "Será gerado automaticamente"}
                          {...field}
                          readOnly={!isEditing}
                          className={!isEditing ? "pr-8" : ""}
                        />
                        {!isEditing && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            {isChecking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                            {!isChecking && isAvailable === true && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                            {!isChecking && isAvailable === false && <AlertCircle className="h-4 w-4 text-amber-500" />}
                          </div>
                        )}
                      </div>
                    </FormControl>
                    {!isEditing && (
                      <p className="text-xs text-muted-foreground">
                        {isChecking && "Verificando disponibilidade..."}
                        {!isChecking && isAvailable === true && "Email disponível."}
                        {!isChecking && isAvailable === false && "Email original em uso. Usando sugestão disponível."}
                        {!isChecking && isAvailable === null && "Gerado automaticamente (iniciais + @afirmeplay.com.br)"}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="registration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matrícula (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Digite a matrícula" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showCitySelect && (
                <FormField
                  control={form.control}
                  name="city_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Município</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um município" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {municipioOptions.map((municipio) => (
                            <SelectItem key={municipio.id} value={municipio.id}>
                              {municipio.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>
        )}

        {!isModalLayout && (
          <>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Digite o nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="email"
                        placeholder={isEditing ? "nome@escola.edu.br" : "Será gerado automaticamente"}
                        {...field}
                        readOnly={!isEditing}
                        className={!isEditing ? "pr-8" : ""}
                      />
                      {!isEditing && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          {isChecking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                          {!isChecking && isAvailable === true && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                          {!isChecking && isAvailable === false && <AlertCircle className="h-4 w-4 text-amber-500" />}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  {!isEditing && (
                    <p className="text-xs text-muted-foreground">
                      {isChecking && "Verificando disponibilidade..."}
                      {!isChecking && isAvailable === true && "Email disponível."}
                      {!isChecking && isAvailable === false && "Email original em uso. Usando sugestão disponível."}
                      {!isChecking && isAvailable === null && "O email é gerado automaticamente pelas iniciais do nome + @afirmeplay.com.br"}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {!isModalLayout && (
          <>
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEditing ? "Nova senha (opcional)" : "Senha"}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} placeholder={isEditing ? "Deixe em branco para manter a senha atual" : "Digite uma senha"} {...field} />
                      <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEditing ? "Confirmar nova senha" : "Confirmar Senha"}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type={showConfirmPassword ? "text" : "password"} placeholder={isEditing ? "Repita a nova senha" : "Confirme sua senha"} {...field} />
                      <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </FormControl>
                  {isEditing && <p className="text-xs text-muted-foreground">Necessário apenas se desejar atualizar a senha.</p>}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="registration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Matrícula (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Digite a matrícula" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showCitySelect && (
              <FormField
                control={form.control}
                name="city_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Município</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um município" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {municipioOptions.map((municipio) => (
                          <SelectItem key={municipio.id} value={municipio.id}>{municipio.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </>
        )}

        {/* Seção Função (modal) ou campo único (default) */}
        {isModalLayout && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#7B3FE4]" />
              Função
            </h4>
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => {
                const allRoles = [
                  { value: "Administrador", label: "Administrador" },
                  { value: "Técnico Administrador", label: "Técnico Administrador" },
                  { value: "Aplicador", label: "Aplicador" },
                  { value: "Diretor", label: "Diretor" },
                  { value: "Coordenador", label: "Coordenador" },
                  { value: "Professor", label: "Professor" },
                  { value: "Aluno", label: "Aluno" }
                ];
                const availableRoles = allowedRoles?.length ? allRoles.filter((r) => allowedRoles.includes(r.value)) : allRoles;
                return (
                  <FormItem>
                    <FormLabel>Perfil do usuário *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma função" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableRoles.map((role) => (
                          <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </div>
        )}

        {/* Seção Senha (modal): ao editar opcional, ao criar obrigatória */}
        {isModalLayout && (isEditing ? (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#7B3FE4]" />
              Alterar senha (opcional)
            </h4>
            <p className="text-xs text-muted-foreground">Deixe em branco para manter a senha atual.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nova senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showPassword ? "text" : "password"} placeholder="Deixe em branco para manter" {...field} />
                        <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar nova senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showConfirmPassword ? "text" : "password"} placeholder="Repita a nova senha" {...field} />
                        <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#7B3FE4]" />
              Senha de acesso
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showPassword ? "text" : "password"} placeholder="Digite uma senha" {...field} />
                        <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar senha *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showConfirmPassword ? "text" : "password"} placeholder="Confirme sua senha" {...field} />
                        <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        ))}

        {!isModalLayout && (
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => {
              const allRoles = [
                { value: "Administrador", label: "Administrador" },
                { value: "Técnico Administrador", label: "Técnico Administrador" },
                { value: "Aplicador", label: "Aplicador" },
                { value: "Diretor", label: "Diretor" },
                { value: "Coordenador", label: "Coordenador" },
                { value: "Professor", label: "Professor" },
                { value: "Aluno", label: "Aluno" }
              ];
              const availableRoles = allowedRoles?.length ? allRoles.filter((r) => allowedRoles.includes(r.value)) : allRoles;
              return (
                <FormItem>
                  <FormLabel>Função</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma função" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        )}

        <div className={isModalLayout ? "flex justify-end gap-2 pt-2 border-t" : "flex justify-end"}>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : isEditing ? (
              "Salvar alterações"
            ) : (
              "Cadastrar"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
import LOGO from "/LOGO-1.png";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5">
          <img src={LOGO} alt="Afirmeplay" className="h-10 w-auto" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 md:py-14">
        <article className="space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Política de Privacidade – Afirmeplay Edu
            </h1>
            <p className="text-sm text-slate-500">
              <strong className="font-semibold text-slate-700">Última atualização:</strong>{" "}
              22 de julho de 2026
            </p>
          </header>

          <div className="space-y-4 leading-relaxed text-slate-700">
            <p>
              A Afirmeplay valoriza a privacidade de seus usuários e está comprometida com a
              proteção de seus dados pessoais, em conformidade com a Lei Geral de Proteção de
              Dados (LGPD – Lei nº 13.709/2018).
            </p>
            <p>
              Esta Política de Privacidade descreve como o aplicativo{" "}
              <strong>Afirmeplay Edu</strong> trata as informações utilizadas durante seu
              funcionamento.
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">1. Sobre o aplicativo</h2>
            <p className="leading-relaxed text-slate-700">
              O <strong>Afirmeplay Edu</strong> é um aplicativo destinado à realização de provas,
              cartões-resposta e formulários socioeconômicos, permitindo que essas atividades
              sejam executadas mesmo sem conexão com a internet.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              2. Dados tratados pelo aplicativo
            </h2>
            <p className="leading-relaxed text-slate-700">
              O aplicativo <strong>não realiza cadastro de usuários</strong>.
            </p>
            <p className="leading-relaxed text-slate-700">
              O acesso é feito utilizando credenciais (e-mail e senha) previamente criadas e
              administradas pela plataforma web da Afirmeplay ou pela instituição de ensino
              responsável.
            </p>
            <p className="leading-relaxed text-slate-700">
              Durante sua utilização, o aplicativo pode acessar informações necessárias para:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-slate-700">
              <li>autenticar o usuário;</li>
              <li>identificar o aluno ou participante;</li>
              <li>sincronizar provas e formulários;</li>
              <li>
                enviar respostas das avaliações para a plataforma quando houver conexão com a
                internet.
              </li>
            </ul>
            <p className="leading-relaxed text-slate-700">
              Essas informações são utilizadas exclusivamente para o funcionamento do serviço
              educacional e não são empregadas para fins publicitários ou comerciais.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">3. Permissões utilizadas</h2>
            <p className="leading-relaxed text-slate-700">
              O aplicativo solicita acesso à câmera do dispositivo exclusivamente para:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-slate-700">
              <li>
                realizar a leitura de QR Codes utilizados para baixar os pacotes de provas e
                avaliações.
              </li>
            </ul>
            <p className="leading-relaxed text-slate-700">
              A câmera não é utilizada para gravação contínua, monitoramento ou captura de
              imagens para outras finalidades.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">4. Compartilhamento de dados</h2>
            <p className="leading-relaxed text-slate-700">
              A Afirmeplay{" "}
              <strong>
                não vende, aluga ou compartilha informações pessoais com terceiros para fins
                comerciais
              </strong>
              .
            </p>
            <p className="leading-relaxed text-slate-700">
              Os dados tratados pelo aplicativo permanecem vinculados à plataforma educacional
              utilizada pela instituição responsável.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">5. Serviços de terceiros</h2>
            <p className="leading-relaxed text-slate-700">
              O aplicativo <strong>não utiliza serviços de terceiros</strong> para coleta de
              dados, publicidade, análise de uso ou monitoramento.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">6. Segurança</h2>
            <p className="leading-relaxed text-slate-700">
              A Afirmeplay adota medidas técnicas e administrativas adequadas para proteger as
              informações tratadas pelo aplicativo contra acesso não autorizado, alteração,
              divulgação ou destruição.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              7. Exclusão de conta e dados
            </h2>
            <p className="leading-relaxed text-slate-700">
              O aplicativo não permite a criação ou exclusão de contas.
            </p>
            <p className="leading-relaxed text-slate-700">
              Caso o usuário deseje solicitar a exclusão de sua conta ou de seus dados pessoais,
              deverá entrar em contato com a instituição responsável (escola, universidade ou
              organização) ou utilizar os canais disponíveis na plataforma web da Afirmeplay.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">8. Uso por menores de idade</h2>
            <p className="leading-relaxed text-slate-700">
              O Afirmeplay Edu pode ser utilizado por menores de 13 anos e por usuários de outras
              faixas etárias, sempre no contexto de instituições de ensino ou organizações
              autorizadas.
            </p>
            <p className="leading-relaxed text-slate-700">
              Quando aplicável, o tratamento dos dados é realizado sob a responsabilidade da
              instituição de ensino ou do responsável legal pelo aluno, conforme previsto na
              legislação vigente.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              9. Alterações nesta Política
            </h2>
            <p className="leading-relaxed text-slate-700">
              Esta Política de Privacidade poderá ser atualizada periodicamente para refletir
              melhorias no aplicativo ou alterações legais.
            </p>
            <p className="leading-relaxed text-slate-700">
              A versão mais recente estará sempre disponível na página oficial da Política de
              Privacidade.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">10. Contato</h2>
            <p className="leading-relaxed text-slate-700">
              Em caso de dúvidas sobre esta Política de Privacidade ou sobre o tratamento de
              dados pessoais, entre em contato conosco:
            </p>
            <div className="space-y-1 leading-relaxed text-slate-700">
              <p>
                <strong>Afirmeplay</strong>
              </p>
              <p>
                E-mail:{" "}
                <a
                  href="mailto:suporte@afirmeplay.com.br"
                  className="font-medium text-[#5b21b6] underline underline-offset-2 hover:text-[#4c1d95]"
                >
                  suporte@afirmeplay.com.br
                </a>
              </p>
              <p>País: Brasil</p>
            </div>
          </section>
        </article>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-6 text-sm text-slate-500">
          © {new Date().getFullYear()} Afirmeplay
        </div>
      </footer>
    </div>
  );
}

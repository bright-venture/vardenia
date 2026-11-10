import type { LegalEdition } from '../legal'
import { CONTACT, COMMERCIAL_REGISTRATION_NUMBER } from '../contact'
import { TBD, contactEmail } from '../placeholder'

/**
 * The privacy policy and terms in Portuguese. A translation of lib/legal, which
 * governs. Brazilian Portuguese, like the rest of the site (você, senha, celular).
 */

const office = CONTACT.postalAddress
  ? `O site é administrado pela Vardenia, com sede em ${CONTACT.postalAddress}.`
  : TBD('the registered office address of Vardenia, which runs the site')
const registration = `Número de registro comercial da Vardenia: ${COMMERCIAL_REGISTRATION_NUMBER}.`
const email = contactEmail('pt')

export const pt: LegalEdition = {
  privacyDescription: 'Como a Vardenia trata as suas informações.',
  termsDescription: 'Os termos que você aceita ao usar a Vardenia.',
  lastUpdated: 'Última atualização',
  translationNote:
    'Esta é uma tradução do texto em inglês. Se em algum momento forem diferentes, vale a versão em inglês.',
  readInEnglish: 'Ler em inglês',

  privacy: {
    title: 'Política de privacidade',
    intro:
      'Esta política explica o que a Vardenia coleta sobre você, por quê, e o que você pode nos pedir para fazer a respeito. Ela descreve o site como ele realmente funciona, e não uma declaração geral de intenções.',
    sections: [
      {
        heading: 'Quem somos',
        body: [
          'A Vardenia é uma revista impressa e um guia online de lugares no Líbano.',
          office,
          registration,
          'Se quiser perguntar sobre qualquer ponto desta política, entre em contato.',
          email,
        ],
      },
      {
        heading: 'O que coletamos',
        body: [
          'Apenas o que o site precisa para fazer o que você pede.',
          '- **Se você abrir uma conta**: seu nome, seu endereço de e-mail e um número de telefone, se você quiser informar. Sua senha é guardada apenas como hash: não conseguimos lê-la nem recuperá-la.',
          '- **Se você fizer uma reserva**: a data e o horário, quantas pessoas e o que você escrever no campo de observações. Também guardamos um número de referência para que você e o estabelecimento possam identificar a reserva depois.',
          '- **Depois da sua visita**: enviamos um e-mail perguntando se você foi e quanto gastou, aproximadamente. Guardamos sua resposta e o valor junto com a reserva.',
          '- **Se você enviar um recibo**: a foto ou o PDF da conta, o total e a moeda que você confirmar, e o que foi lido dele automaticamente (o total, o número do recibo, a data impressa nele e se o nome do lugar aparece). Um recibo pode mostrar mais do que o total, como o que você pediu, um nome ou os últimos dígitos de um cartão, então cubra, antes de enviar, tudo o que você prefira que a gente não veja.',
          '- **Se você escrever uma avaliação**: o que você escreveu, sua nota, e o primeiro nome e a inicial com que ela aparece.',
          '- **Seu passaporte e seus lugares salvos**: os lugares que você visitou por meio de uma reserva, que rendem um carimbo, e os lugares que você salvou.',
          '- **Se você escanear um código impresso**: o código, o horário, sua cidade e seu país, e se você estava num celular ou num computador. Não registramos sua localização exata e não guardamos seu endereço IP de forma alguma: ele é transformado em hash na memória para identificar leituras repetidas e nunca é gravado.',
          '- **Se algo der errado**: um registro do erro, do qual endereços de e-mail, senhas e tokens de acesso são removidos automaticamente antes de ser guardado.',
          '- **Quando você lê qualquer página**: quais páginas foram visitadas, de qual site veio a visita, o país de origem e se era um celular ou um computador. Isso é medido para nós por um fornecedor de análise de audiência, sem nenhum cookie, e é contado sem ser ligado a você.',
          '- **Toda visita** passa pela rede que protege o site contra ataques, que, como qualquer rede, vê o endereço de onde você se conecta. Quando você abre uma conta, ela também verifica que você é uma pessoa e não um programa.',
          '- **A velocidade de carregamento das páginas**: para visitantes fora da União Europeia, a rede que transporta o site também mede a rapidez com que cada página carrega e responde, qual página era, o navegador e o país, e conta a visita. Ela não instala nenhum cookie e não é ligada a você.',
          'Não usamos rastreadores de publicidade, não montamos um perfil seu, e nada aqui segue você para outro site.',
        ],
      },
      {
        heading: 'Sobre o campo de observações da reserva',
        body: [
          'O campo de observações do formulário de reserva é onde você pode avisar o lugar sobre uma necessidade alimentar, um aniversário ou uma necessidade de acessibilidade, como uma cadeira de rodas. Parte disso é informação de saúde, que a lei libanesa (Lei nº 81 de 2018 sobre transações eletrônicas e dados pessoais, artigo 91) só nos permite tratar com o seu consentimento explícito.',
          '- **É opcional.** Deixe em branco e seu pedido de reserva fica exatamente igual. Você sempre pode avisar o lugar pessoalmente.',
          '- **Se você escrever nele, marca uma caixa para concordar** que a Vardenia e o lugar usem o que você escreveu, inclusive qualquer informação de saúde, apenas para organizar essa visita. A caixa nunca é marcada por você, e as observações não são enviadas sem ela.',
          '- **Quem recebe.** O lugar onde você reserva e a equipe da Vardenia. Mais ninguém.',
          '- **Por quanto tempo é guardado.** Junto com a reserva, por 12 meses após a visita.',
          '- **Seus direitos.** Você pode nos pedir para mostrar o que escreveu, para corrigir ou para apagar.',
          'Escreva apenas o que você se sentir à vontade para compartilhar com esse lugar.',
        ],
      },
      {
        heading: 'Sua resposta depois de uma visita, e o seu recibo',
        body: [
          'Os estabelecimentos que aparecem na Vardenia nos pagam uma comissão sobre o que seus clientes gastam nas visitas reservadas pelo site. Sua visita não custa nada a mais para você: você paga o estabelecimento normalmente, e a Vardenia não cobra nada de você.',
          'É por isso que perguntamos se você foi e quanto gastou, aproximadamente, e é por isso que você pode nos enviar o recibo. Eles nos permitem conferir se um estabelecimento é cobrado de forma justa e resolver a questão quando o estabelecimento e você se lembram da visita de jeitos diferentes. Responder é escolha sua, e enviar um recibo também.',
          '- **Quem vê o recibo.** Você e a equipe da Vardenia. O estabelecimento nunca vê a foto. Ele vê apenas o valor sobre o qual foi cobrado e que esse valor veio de um recibo.',
          '- **A leitura automática.** Quando você escolhe a foto, um serviço automatizado pode ler dela o total, o número do recibo, a data e o nome do lugar, para que você só precise conferir o valor. Você sempre pode corrigir o total antes de enviar, e nada é decidido sobre você com base nisso.',
          '- **Cada recibo conta uma vez só.** O número do recibo é lido para que o mesmo recibo não possa ser enviado duas vezes para o mesmo lugar. Um recibo que já foi enviado é recusado.',
          '- **Quem vê sua resposta.** A equipe da Vardenia. Se ela não bater com o que o estabelecimento registrou, podemos avisar o estabelecimento de que a visita está em disputa enquanto analisamos o caso.',
          '- **Por quanto tempo são guardados.** O recibo, o que foi lido dele e sua resposta são guardados por 12 meses após a visita.',
        ],
      },
      {
        heading: 'Por que podemos guardar essas informações',
        body: [
          '- **Para fazer o que você pediu.** Fazer uma reserva, manter sua conta e enviar a confirmação fazem parte do acordo entre nós.',
          '- **Para tocar o negócio.** Contar as leituras de um código impresso mostra a um anunciante se o espaço dele funcionou, e sua resposta depois de uma visita e seu recibo mostram quanto um estabelecimento deve. Os números de leituras são agregados e nunca identificam um leitor.',
          '- **Para manter o site funcionando com segurança.** Limitar o número de solicitações, identificar abusos automatizados e registrar erros.',
        ],
      },
      {
        heading: 'Quem mais vê essas informações',
        body: [
          '- **O estabelecimento onde você reserva** vê seu nome, seu telefone se você informou, os detalhes da reserva e suas observações. Ele precisa disso para guardar sua mesa e ligar para você se algo mudar. Ele não vê seu endereço de e-mail, seu recibo nem sua resposta depois da visita.',
          '- **Todos que leem o site** veem uma avaliação depois que a publicamos, com seu primeiro nome e a inicial, nunca seu nome completo nem qualquer outra coisa sobre você.',
          '- **Nossos fornecedores**, que tratam os dados em nosso nome e não podem usá-los para mais nada: a hospedagem do nosso banco de dados e arquivos, a hospedagem do nosso site, a rede que protege o site e mede a velocidade de carregamento, o serviço que envia nossos e-mails, o serviço que conta as visitas às páginas e o serviço que lê os recibos. Você pode nos perguntar quem são.',
          'Não vendemos suas informações nem as compartilhamos para o marketing de mais ninguém.',
        ],
      },
      {
        heading: 'Onde elas ficam guardadas',
        body: [
          'Nosso banco de dados e os arquivos dos recibos ficam hospedados na União Europeia, em Frankfurt. Nossa hospedagem do site, nosso fornecedor de rede, nosso fornecedor de e-mail e o serviço que conta as visitas às páginas podem tratar dados fora dela, e um recibo lido automaticamente é lido nos Estados Unidos.',
          'A hospedagem do nosso banco de dados guarda um backup diário por sete dias. Toda semana também guardamos uma cópia completa do banco de dados e de cada foto e recibo num computador que controlamos, fora da União Europeia, para que nada se perca se um fornecedor falhar.',
          'Quando dados saem da União Europeia, nos baseamos no Marco de Privacidade de Dados UE-EUA (EU-US Data Privacy Framework) quando o fornecedor é certificado por ele e, caso contrário, nas cláusulas contratuais-padrão da Comissão Europeia incluídas no nosso contrato com esse fornecedor.',
          'Nossa cópia semanal é criptografada antes de ser guardada, e só a Vardenia tem a chave que a abre.',
        ],
      },
      {
        heading: 'Por quanto tempo guardamos',
        body: [
          'Só enquanto for necessário para o motivo pelo qual guardamos.',
          '- **Reservas**, incluindo suas observações: 12 meses após a visita.',
          '- **Recibos**, o que foi lido deles e sua resposta depois de uma visita: 12 meses após a visita.',
          '- **Registros de leituras de códigos impressos**: 12 meses.',
          '- **Registros de erros**: 90 dias.',
          '- **Sua conta**: até você encerrá-la.',
          '- **Avaliações**: enquanto estiverem publicadas, ou até você nos pedir para retirar uma.',
          '- **Faturas mensais aos estabelecimentos**: dez anos, como a lei libanesa exige para os registros contábeis de uma empresa. Uma fatura lista cada visita pela referência da reserva, data e valor, nunca pelo nome de um cliente.',
        ],
      },
      {
        heading: 'O que você pode pedir',
        body: [
          'Você pode nos pedir uma cópia do que temos sobre você, para corrigir, para apagar, para enviar a você num formato portátil ou para pararmos de usar de uma determinada forma.',
          'Peça, e responderemos em até um mês.',
          email,
          'Se você não ficar satisfeito com a forma como tratamos o seu pedido, pode fazer uma reclamação à autoridade nacional de proteção de dados do seu país.',
        ],
      },
      {
        heading: 'Cookies',
        body: [
          'Dois cookies pequenos, e só depois que você entra na conta. Um mantém você conectado; o outro só avisa a página para mostrar o link da sua conta em vez de «Entrar». Nenhum é usado para rastrear você, nenhum é compartilhado, e não há neste site nenhum cookie de publicidade ou de análise.',
          'Essa última parte é proposital. Nós contamos as visitas às páginas, sim, e escolhemos um fornecedor que não precisa de nenhum cookie para isso, então medir como o site é lido não custa nada a você nem pede nada a você.',
          'Como os dois são estritamente necessários para oferecer algo que você pediu, não há aviso de consentimento. Se algum dia acrescentarmos algo que não seja estritamente necessário, haverá.',
          'A rede que transporta cada visita, e que faz a verificação no formulário de cadastro, também não instala nenhum cookie neste site.',
        ],
      },
      {
        heading: 'Crianças',
        body: [
          'A Vardenia não é voltada para crianças, e não coletamos intencionalmente nada sobre elas. Se você acha que uma criança nos passou informações, escreva para nós e vamos removê-las.',
        ],
      },
      {
        heading: 'Alterações',
        body: [
          'Se mudarmos esta política de um jeito relevante, vamos avisar nesta página e atualizar a data no topo. Versões anteriores podem ser obtidas mediante solicitação.',
        ],
      },
    ],
  },

  terms: {
    title: 'Termos de uso',
    intro:
      'Estes termos cobrem o uso do site da Vardenia, a abertura de uma conta, o pedido de uma reserva e o que você nos envia depois: sua resposta sobre a visita, um recibo ou uma avaliação. Leia com atenção a seção sobre reservas, porque ela explica com quem o seu acordo realmente é.',
    sections: [
      {
        heading: 'Quem somos',
        body: [
          'A Vardenia publica uma revista impressa e um guia online de lugares no Líbano.',
          office,
          registration,
        ],
      },
      {
        heading: 'O que a Vardenia é, e o que não é',
        body: [
          'Somos um guia. Escolhemos cada lugar que aparece aqui e escrevemos sobre eles nós mesmos. Um estabelecimento não pode editar o que dizemos sobre ele.',
          'Não somos o hotel, o restaurante nem o espaço. Não somos donos deles, não os administramos nem os supervisionamos, e não podemos garantir a sua experiência neles.',
        ],
      },
      {
        heading: 'Como os lugares são listados e ordenados',
        body: [
          'Cada lugar aqui foi escolhido por nós. Pagar não coloca um lugar no guia: um lugar que escolhemos paga depois à Vardenia para ser listado, em um de três níveis: bronze, uma ficha no site; prata, que acrescenta uma página na revista impressa; e ouro, que acrescenta o primeiro lugar em cada lista e um espaço na página inicial.',
          '- **A ordem de uma lista reflete esse nível.** Primeiro vêm os lugares ouro, depois prata, depois bronze, e os lugares do mesmo nível ficam em ordem alfabética. Um lugar mais acima numa lista pagou por um nível mais alto; ele não está classificado como melhor.',
          '- **A faixa no topo da página inicial** mostra lugares ouro. É um espaço pago, e está identificado como escolhido pelos lugares que apoiam este guia.',
          '- **Cada lugar aqui foi visitado e verificado por nós pessoalmente** antes de aparecer.',
          '- **Os lugares também pagam uma comissão** sobre o que os clientes gastam nas visitas reservadas pela Vardenia. Isso não muda o que você paga.',
          'Os lugares sugeridos no fim de uma ficha são primeiro os mais próximos, qualquer que seja o nível.',
        ],
      },
      {
        heading: 'Reservas',
        body: [
          'Esta é a parte que vale a pena ler duas vezes.',
          '- **Sua reserva é com o estabelecimento, não com a gente.** Repassamos seu pedido e contamos o que eles responderem. O acordo para guardar uma mesa é entre vocês dois.',
          '- **Um pedido não é uma reserva.** Alguns lugares confirmam na hora e outros respondem manualmente. Nada fica garantido até você receber uma confirmação dizendo isso, e um pedido pode ser recusado.',
          '- **Cancelar.** Você pode cancelar pela sua conta a qualquer momento, e o estabelecimento é avisado.',
          '- **Taxas por cancelamento em cima da hora ou por não comparecimento** dependem do lugar. Alguns lugares cobram e outros não. Uma taxa dessas é a política do próprio lugar, entre você e ele.',
          '- Não recebemos pagamentos por reservas nem guardamos dados de cartão.',
        ],
      },
      {
        heading: 'Depois da sua visita: sua resposta e o seu recibo',
        body: [
          'Depois de uma visita reservada pela Vardenia, enviamos um e-mail perguntando se você foi e quanto gastou, aproximadamente, e você pode nos enviar o recibo. As duas coisas são escolha sua.',
          '- **Responda com sinceridade.** Sua resposta é como conferimos o que é cobrado do estabelecimento, então só diga que foi se você foi. Sua primeira resposta é definitiva, e você pode dá-la em até 30 dias após a visita.',
          '- **Envie só o seu próprio recibo, e o verdadeiro.** Precisa ser a conta daquela visita. Quando você escolhe a foto, o total pode ser lido dela automaticamente; confira o valor antes de enviar e corrija se estiver errado.',
          '- **Divergências.** Se a sua versão da visita e a do estabelecimento forem diferentes, a equipe da Vardenia analisa as duas, e o recibo se houver, e decide. Podemos perguntar a qualquer um de vocês sobre o assunto.',
          'Podemos recusar, ou deixar de contar, um recibo ou uma resposta que pareça falso, e suspender uma conta que os envie.',
        ],
      },
      {
        heading: 'Seu passaporte',
        body: [
          'Cada visita que você fez por meio de uma reserva, e que o estabelecimento confirmou, rende um carimbo no seu passaporte Vardenia.',
          '- Um carimbo é um registro da visita, não é dinheiro nem vale, e não tem valor em dinheiro.',
          '- Um carimbo pode ser retirado se ficar claro que a visita não aconteceu, por exemplo depois que uma disputa for resolvida a favor do estabelecimento.',
        ],
      },
      {
        heading: 'Avaliações',
        body: [
          'Você pode avaliar um lugar depois de concluída uma visita que reservou pela Vardenia.',
          '- **Lemos cada avaliação antes de publicar**, e podemos recusar uma que não seja sobre uma visita real, que seja ofensiva ou que revele informações pessoais.',
          '- **Ela aparece com seu primeiro nome e a inicial.**',
          '- **Ao enviá-la, você nos autoriza** a publicá-la no site da Vardenia, junto com o lugar de que trata, enquanto estiver publicada. Você pode nos pedir para retirá-la.',
          '- **Ela aparece só no site.** Não imprimimos avaliações na revista nem as usamos em publicidade.',
        ],
      },
      {
        heading: 'Sua conta',
        body: [
          'Você é responsável pelo que acontece na sua conta, então guarde sua senha só para você e nos avise se achar que outra pessoa a tem.',
          'Informe dados corretos. Uma reserva feita com um nome ou número que não é real é uma mesa que um estabelecimento guarda para ninguém.',
          'Você pode nos pedir para encerrar sua conta a qualquer momento.',
        ],
      },
      {
        heading: 'Usar o site de forma justa',
        body: [
          'Por favor, não faça reservas que você não pretende cumprir, não envie respostas ou recibos que não sejam verdadeiros, não tente acessar partes do site que não são suas, não extraia o guia de forma automatizada e não use o site para infringir a lei ou assediar alguém.',
          'Podemos suspender uma conta que faça qualquer uma dessas coisas.',
        ],
      },
      {
        heading: 'Se você administra um estabelecimento listado',
        body: [
          'Estes termos são para leitores e clientes. Um estabelecimento listado na Vardenia tem o seu próprio contrato com a gente, assinado em papel ou combinado por e-mail, que cobre o nível dele, a comissão, a fatura mensal, o prazo que ele tem para contestar uma visita que conste nela e o prazo que tem para pagar. Estes termos não mudam esse contrato.',
        ],
      },
      {
        heading: 'Nosso conteúdo',
        body: [
          'Os textos, as fotos, o design e o material impresso da Vardenia pertencem a nós ou às pessoas que nos licenciaram. Fique à vontade para ler, compartilhar e colocar links para eles. Você não pode republicá-los com fins comerciais sem nos pedir.',
          'Os nomes e logotipos dos estabelecimentos pertencem a esses estabelecimentos.',
        ],
      },
      {
        heading: 'Quando algo dá errado',
        body: [
          'Tomamos um cuidado razoável para que as informações aqui estejam corretas, mas horários mudam, cozinhas fecham e estabelecimentos mudam de endereço. Não podemos prometer que o site esteja sempre correto ou sempre disponível.',
          '- **Pelo que somos responsáveis.** Nada nestes termos limita a nossa responsabilidade por fraude ou por falta grave da nossa parte.',
          '- **Pelo que não somos responsáveis.** O que um lugar listado faz ou deixa de fazer, inclusive uma reserva que ele não honre; um lugar que fechou, mudou de endereço ou mudou de horário desde que escrevemos sobre ele; e o site ficar fora do ar por um tempo.',
          '- **Quando somos responsáveis**, é pelo prejuízo direto que você sofreu e que podia ser razoavelmente previsto, e não por prejuízo indireto, como uma oportunidade perdida.',
        ],
      },
      {
        heading: 'Lei aplicável',
        body: [
          'Estes termos são regidos pela lei libanesa, e os tribunais libaneses julgam qualquer disputa sobre eles.',
          'Antes de ir à Justiça, escreva para nós. A maioria das divergências se resolve com uma mensagem.',
          email,
        ],
      },
      {
        heading: 'Alterações',
        body: [
          'Podemos atualizar estes termos. Se uma mudança for relevante, vamos avisar nesta página e atualizar a data no topo. Continuar usando o site depois disso significa que os novos termos se aplicam.',
        ],
      },
    ],
  },
}

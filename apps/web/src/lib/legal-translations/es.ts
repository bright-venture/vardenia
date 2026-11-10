import type { LegalEdition } from '../legal'
import { CONTACT, COMMERCIAL_REGISTRATION_NUMBER } from '../contact'
import { TBD, contactEmail } from '../placeholder'

/** The privacy policy and terms in Spanish. A translation of lib/legal, which governs. */

const office = CONTACT.postalAddress
  ? `El sitio lo gestiona Vardenia, con domicilio social en ${CONTACT.postalAddress}.`
  : TBD('the registered office address of Vardenia, which runs the site')
const registration = `Número de registro mercantil de Vardenia: ${COMMERCIAL_REGISTRATION_NUMBER}.`
const email = contactEmail('es')

export const es: LegalEdition = {
  privacyDescription: 'Cómo trata Vardenia tu información.',
  termsDescription: 'Las condiciones que aceptas al usar Vardenia.',
  lastUpdated: 'Última actualización',
  translationNote:
    'Esta es una traducción del texto en inglés. Si alguna vez difieren, se aplica la versión en inglés.',
  readInEnglish: 'Leer en inglés',

  privacy: {
    title: 'Política de privacidad',
    intro:
      'Esta política explica qué recoge Vardenia sobre ti, por qué y qué puedes pedirnos que hagamos al respecto. Describe el sitio tal como funciona en realidad, no una declaración general de intenciones.',
    sections: [
      {
        heading: 'Quiénes somos',
        body: [
          'Vardenia es una revista impresa y un directorio en línea de lugares en el Líbano.',
          office,
          registration,
          'Si quieres preguntar por cualquier punto de esta política, ponte en contacto con nosotros.',
          email,
        ],
      },
      {
        heading: 'Qué recogemos',
        body: [
          'Solo lo que el sitio necesita para hacer lo que le pides.',
          '- **Si abres una cuenta**: tu nombre, tu dirección de correo electrónico y un número de teléfono si decides darlo. Tu contraseña se guarda solo como hash: no podemos leerla ni recuperarla.',
          '- **Si haces una reserva**: la fecha y la hora, cuántas personas y lo que escribas en el campo de notas. También guardamos un número de referencia para que tú y el local puedan identificar la reserva más adelante.',
          '- **Después de tu visita**: te enviamos un correo para preguntarte si fuiste y cuánto gastaste aproximadamente. Guardamos tu respuesta y el importe con la reserva.',
          '- **Si envías un recibo**: la foto o el PDF de la cuenta, el total y la moneda que confirmas, y lo que se leyó de él automáticamente (el total, el número del recibo, la fecha impresa en él y si aparece el nombre del lugar). Un recibo puede mostrar más que el total, como lo que pediste, un nombre o los últimos dígitos de una tarjeta, así que tapa antes de enviarlo cualquier cosa que prefieras que no veamos.',
          '- **Si escribes una reseña**: lo que escribiste, tu valoración, y el nombre de pila y la inicial con los que se muestra.',
          '- **Tu pasaporte y tus lugares guardados**: los lugares que has visitado mediante una reserva, que te dan un sello, y los lugares que has guardado.',
          '- **Si escaneas un código impreso**: el código, la hora, tu ciudad y país, y si usabas un teléfono o una computadora. No registramos tu ubicación exacta y no guardamos tu dirección IP en absoluto: se convierte en un hash en memoria para detectar escaneos repetidos y nunca se escribe.',
          '- **Si algo falla**: un registro del error, del que se eliminan automáticamente las direcciones de correo, las contraseñas y los tokens de acceso antes de guardarlo.',
          '- **Cuando lees cualquier página**: qué páginas se visitaron, desde qué sitio llegó la visita, el país de origen y si era un teléfono o una computadora. Lo mide para nosotros un proveedor de analítica, sin ninguna cookie, y se cuenta sin vincularse a ti.',
          '- **Cada visita** pasa por la red que protege el sitio de ataques, que, como cualquier red, ve la dirección desde la que te conectas. Cuando abres una cuenta, también comprueba que eres una persona y no un programa.',
          '- **La velocidad de carga de las páginas**: para los visitantes de fuera de la Unión Europea, la red que transporta el sitio también mide lo rápido que carga y responde cada página, qué página era, el navegador y el país, y cuenta la visita. No instala ninguna cookie y no se vincula a ti.',
          'No usamos rastreadores publicitarios, no creamos un perfil sobre ti y nada de aquí te sigue a otro sitio.',
        ],
      },
      {
        heading: 'Sobre el campo de notas de la reserva',
        body: [
          'El campo de notas del formulario de reserva es donde puedes contarle al lugar una necesidad alimentaria, un aniversario o una necesidad de accesibilidad, como una silla de ruedas. Parte de eso es información de salud, que la ley libanesa (Ley n.º 81 de 2018 sobre transacciones electrónicas y datos personales, artículo 91) solo nos permite tratar con tu consentimiento explícito.',
          '- **Es opcional.** Déjalo en blanco y tu solicitud de reserva será exactamente igual. Siempre puedes decírselo al lugar en persona.',
          '- **Si escribes en él, marcas una casilla para aceptar** que Vardenia y el lugar usen lo que escribiste, incluida cualquier información de salud, solo para organizar esa visita. La casilla nunca se marca por ti y las notas no se envían sin ella.',
          '- **Quién la recibe.** El lugar donde reservas y el equipo de Vardenia. Nadie más.',
          '- **Cuánto tiempo se guarda.** Con la reserva, durante 12 meses después de la visita.',
          '- **Tus derechos.** Puedes pedirnos que te mostremos lo que escribiste, que lo corrijamos o que lo borremos.',
          'Escribe solo lo que te sientas cómodo compartiendo con ese lugar.',
        ],
      },
      {
        heading: 'Tu respuesta después de una visita, y tu recibo',
        body: [
          'Los locales que aparecen en Vardenia nos pagan una comisión sobre lo que gastan sus clientes en las visitas reservadas a través del sitio. Tu visita no te cuesta nada más: pagas al local como siempre y Vardenia no te cobra nada.',
          'Por eso te preguntamos si fuiste y cuánto gastaste aproximadamente, y por eso puedes enviarnos el recibo. Nos permiten comprobar que a un local se le factura de forma justa y resolverlo cuando tú y el local recuerdan la visita de forma distinta. Responder depende de ti, y enviar un recibo también.',
          '- **Quién ve el recibo.** Tú y el equipo de Vardenia. El local nunca ve la foto. Solo ve el importe sobre el que se le facturó y que procede de un recibo.',
          '- **Su lectura automática.** Cuando eliges la foto, un servicio automatizado puede leer de ella el total, el número del recibo, la fecha y el nombre del lugar, para que solo tengas que comprobar la cifra. Siempre puedes corregir el total antes de enviarlo, y no se decide nada sobre ti a partir de ello.',
          '- **Cada recibo cuenta una sola vez.** Se lee el número del recibo para que el mismo recibo no pueda enviarse dos veces para el mismo lugar. Un recibo que ya se ha enviado se rechaza.',
          '- **Quién ve tu respuesta.** El equipo de Vardenia. Si no coincide con lo que registró el local, podemos indicarle que la visita está en disputa mientras lo revisamos.',
          '- **Cuánto tiempo se guardan.** El recibo, lo que se leyó de él y tu respuesta se guardan 12 meses después de la visita.',
        ],
      },
      {
        heading: 'Por qué podemos conservarla',
        body: [
          '- **Para hacer lo que pediste.** Hacer una reserva, gestionar tu cuenta y enviarte la confirmación forman parte del acuerdo entre nosotros.',
          '- **Para llevar el negocio.** Contar los escaneos de un código impreso le dice a un anunciante si su emplazamiento funcionó, y tu respuesta después de una visita y tu recibo nos dicen lo que debe un local. Las cifras de escaneos se agregan y nunca identifican a un lector.',
          '- **Para que el sitio funcione con seguridad.** Limitar el número de solicitudes, detectar abusos automatizados y registrar errores.',
        ],
      },
      {
        heading: 'Quién más la ve',
        body: [
          '- **El local donde reservas** ve tu nombre, tu número de teléfono si lo diste, los detalles de la reserva y tus notas. Los necesita para guardarte la mesa y llamarte si algo cambia. No ve tu dirección de correo, tu recibo ni tu respuesta después de la visita.',
          '- **Todos los que leen el sitio** ven una reseña una vez que la publicamos, con tu nombre de pila y tu inicial, nunca tu nombre completo ni nada más sobre ti.',
          '- **Nuestros proveedores**, que tratan los datos por cuenta nuestra y no pueden usarlos para nada más: el alojamiento de nuestra base de datos y archivos, el alojamiento de nuestro sitio web, la red que protege el sitio y mide su velocidad de carga, el servicio que envía nuestros correos, el servicio que cuenta las visitas a las páginas y el servicio que lee los recibos. Puedes preguntarnos quiénes son.',
          'No vendemos tu información ni la compartimos para el marketing de nadie más.',
        ],
      },
      {
        heading: 'Dónde se guarda',
        body: [
          'Nuestra base de datos y los archivos de los recibos están alojados en la Unión Europea, en Fráncfort. Nuestro alojamiento web, nuestro proveedor de red, nuestro proveedor de correo y el servicio que cuenta las visitas a las páginas pueden tratar datos fuera de ella, y un recibo leído automáticamente se lee en Estados Unidos.',
          'El alojamiento de nuestra base de datos guarda una copia de seguridad diaria durante siete días. Cada semana también guardamos una copia completa de la base de datos y de cada foto y recibo en una computadora que controlamos, fuera de la Unión Europea, para que no se pierda nada si falla un proveedor.',
          'Cuando los datos salen de la Unión Europea, nos basamos en el Marco de Privacidad de Datos UE-EE. UU. (EU-US Data Privacy Framework) cuando el proveedor está certificado en él y, en caso contrario, en las cláusulas contractuales tipo de la Comisión Europea incluidas en nuestro acuerdo con ese proveedor.',
          'Nuestra copia semanal se cifra antes de guardarse, y solo Vardenia tiene la clave que la abre.',
        ],
      },
      {
        heading: 'Cuánto tiempo la guardamos',
        body: [
          'Solo mientras sea necesaria para el motivo por el que la tenemos.',
          '- **Las reservas**, incluidas tus notas: 12 meses después de la visita.',
          '- **Los recibos**, lo que se leyó de ellos y tu respuesta después de una visita: 12 meses después de la visita.',
          '- **Los registros de escaneos de códigos impresos**: 12 meses.',
          '- **Los registros de errores**: 90 días.',
          '- **Tu cuenta**: hasta que la cierres.',
          '- **Las reseñas**: mientras estén publicadas, o hasta que nos pidas retirar una.',
          '- **Las facturas mensuales a los locales**: diez años, como exige la ley libanesa para los registros contables de una empresa. Una factura recoge cada visita por su referencia de reserva, su fecha y su importe, nunca por el nombre de un cliente.',
        ],
      },
      {
        heading: 'Qué puedes pedir',
        body: [
          'Puedes pedirnos una copia de lo que tenemos sobre ti, que lo corrijamos, que lo borremos, que te lo enviemos en un formato portable o que dejemos de usarlo de una manera concreta.',
          'Pídenoslo y te responderemos en el plazo de un mes.',
          email,
          'Si no estás satisfecho con cómo lo hemos gestionado, puedes presentar una reclamación ante la autoridad nacional de protección de datos de tu país.',
        ],
      },
      {
        heading: 'Cookies',
        body: [
          'Dos pequeñas cookies, y solo cuando inicias sesión. Una mantiene tu sesión iniciada; la otra solo indica a la página que muestre el enlace a tu cuenta en lugar de «Iniciar sesión». Ninguna se usa para rastrearte, ninguna se comparte, y en este sitio no hay ninguna cookie publicitaria ni de analítica.',
          'Eso último es deliberado. Sí contamos las visitas a las páginas, y elegimos un proveedor que no necesita ninguna cookie para hacerlo, así que medir cómo se lee el sitio no te cuesta nada ni te pide nada.',
          'Como ambas son estrictamente necesarias para ofrecerte algo que pediste, no hay aviso de consentimiento. Si algún día añadimos algo que no sea estrictamente necesario, lo habrá.',
          'La red que transporta cada visita, y que hace la comprobación en el formulario de registro, tampoco instala ninguna cookie en este sitio.',
        ],
      },
      {
        heading: 'Menores',
        body: [
          'Vardenia no está dirigida a menores y no recogemos a sabiendas nada sobre ellos. Si crees que un menor nos ha dado información, escríbenos y la eliminaremos.',
        ],
      },
      {
        heading: 'Cambios',
        body: [
          'Si cambiamos esta política de una forma relevante, lo diremos en esta página y actualizaremos la fecha de arriba. Las versiones anteriores pueden obtenerse si se solicitan.',
        ],
      },
    ],
  },

  terms: {
    title: 'Condiciones de uso',
    intro:
      'Estas condiciones cubren el uso del sitio web de Vardenia, la apertura de una cuenta, la solicitud de una reserva y lo que nos envíes después: tu respuesta sobre la visita, un recibo o una reseña. Lee en especial la sección sobre las reservas, porque explica con quién es realmente tu acuerdo.',
    sections: [
      {
        heading: 'Quiénes somos',
        body: [
          'Vardenia publica una revista impresa y un directorio en línea de lugares en el Líbano.',
          office,
          registration,
        ],
      },
      {
        heading: 'Qué es Vardenia y qué no es',
        body: [
          'Somos una guía. Elegimos cada lugar que aparece aquí y escribimos sobre ellos nosotros mismos. Un local no puede editar lo que decimos de él.',
          'No somos el hotel, el restaurante ni el local. No los poseemos, no los gestionamos ni los supervisamos, y no podemos garantizar tu experiencia en ellos.',
        ],
      },
      {
        heading: 'Cómo se incluyen y ordenan los lugares',
        body: [
          'Cada lugar de aquí lo elegimos nosotros. Pagar no da entrada a un lugar: un lugar que hemos elegido paga después a Vardenia para aparecer, en uno de tres niveles: bronce, una ficha en el sitio web; plata, que añade una página en la revista impresa; y oro, que añade el primer puesto en cada lista y un lugar en la página de inicio.',
          '- **El orden de una lista refleja ese nivel.** Primero van los lugares oro, luego plata y luego bronce, y los lugares del mismo nivel van en orden alfabético. Un lugar más arriba en una lista ha pagado un nivel superior; no está clasificado como mejor.',
          '- **La franja de la parte superior de la página de inicio** muestra lugares oro. Es un espacio pagado, y está señalado como elegido por los lugares que respaldan esta guía.',
          '- **Hemos visitado y comprobado en persona cada lugar de aquí** antes de que aparezca.',
          '- **Los lugares también pagan una comisión** sobre lo que gastan los clientes en las visitas reservadas a través de Vardenia. No cambia lo que pagas tú.',
          'Los lugares sugeridos al pie de una ficha son primero los más cercanos, sea cual sea su nivel.',
        ],
      },
      {
        heading: 'Reservas',
        body: [
          'Esta es la parte que merece leerse dos veces.',
          '- **Tu reserva es con el local, no con nosotros.** Transmitimos tu solicitud y te contamos lo que responden. El acuerdo para guardar una mesa es entre tú y el local.',
          '- **Una solicitud no es una reserva.** Algunos lugares confirman al instante y otros responden a mano. No hay nada guardado hasta que recibes una confirmación que lo diga, y una solicitud puede rechazarse.',
          '- **Cancelar.** Puedes cancelar desde tu cuenta en cualquier momento, y se avisa al local.',
          '- **Los cargos por cancelación tardía o por no presentarse** dependen del lugar. Algunos lugares los tienen y otros no. Un cargo así es política propia del lugar, entre tú y él.',
          '- No cobramos pagos por las reservas ni guardamos datos de tarjetas.',
        ],
      },
      {
        heading: 'Después de tu visita: tu respuesta y tu recibo',
        body: [
          'Después de una visita reservada a través de Vardenia, te enviamos un correo para preguntarte si fuiste y cuánto gastaste aproximadamente, y puedes enviarnos el recibo. Ambas cosas dependen de ti.',
          '- **Responde con sinceridad.** Tu respuesta es la forma en que comprobamos lo que se factura al local, así que di que fuiste solo si fuiste. Tu primera respuesta es definitiva, y puedes darla durante los 30 días siguientes a la visita.',
          '- **Envía solo tu propio recibo, y el real.** Debe ser la cuenta de esa visita. Cuando eliges la foto, el total puede leerse de ella automáticamente; comprueba la cifra antes de enviarla y corrígela si es incorrecta.',
          '- **Desacuerdos.** Si tu versión de la visita y la del local no coinciden, el equipo de Vardenia revisa ambas, y el recibo si lo hay, y decide. Podemos preguntarle a cualquiera de los dos al respecto.',
          'Podemos rechazar, o dejar de contar, un recibo o una respuesta que parezca falso, y suspender una cuenta que los envíe.',
        ],
      },
      {
        heading: 'Tu pasaporte',
        body: [
          'Cada visita que hiciste mediante una reserva, y que el local ha confirmado, te da un sello en tu pasaporte Vardenia.',
          '- Un sello es un registro de la visita, no dinero ni un vale, y no tiene valor monetario.',
          '- Un sello puede retirarse si resulta que la visita no ocurrió, por ejemplo después de resolverse una disputa a favor del local.',
        ],
      },
      {
        heading: 'Reseñas',
        body: [
          'Puedes reseñar un lugar una vez completada una visita que reservaste a través de Vardenia.',
          '- **Leemos cada reseña antes de publicarla**, y podemos rechazar una que no trate de una visita real, que sea ofensiva o que revele información personal.',
          '- **Se muestra con tu nombre de pila y tu inicial.**',
          '- **Al enviarla, nos autorizas** a publicarla en el sitio web de Vardenia, junto con el lugar al que se refiere, mientras esté publicada. Puedes pedirnos que la retiremos.',
          '- **Solo aparece en el sitio web.** No imprimimos reseñas en la revista ni las usamos en publicidad.',
        ],
      },
      {
        heading: 'Tu cuenta',
        body: [
          'Eres responsable de lo que ocurra con tu cuenta, así que guarda tu contraseña para ti y avísanos si crees que alguien más la tiene.',
          'Danos datos correctos. Una reserva hecha con un nombre o un número que no es real es una mesa que un local guarda para nadie.',
          'Puedes pedirnos que cerremos tu cuenta en cualquier momento.',
        ],
      },
      {
        heading: 'Usar el sitio de forma justa',
        body: [
          'Por favor, no hagas reservas que no pienses cumplir, no envíes respuestas ni recibos que no sean ciertos, no intentes acceder a partes del sitio que no son tuyas, no extraigas el directorio de forma automatizada y no uses el sitio para infringir la ley ni para acosar a nadie.',
          'Podemos suspender una cuenta que haga cualquiera de esas cosas.',
        ],
      },
      {
        heading: 'Si gestionas un local que aparece en la guía',
        body: [
          'Estas condiciones son para lectores y clientes. Un local que aparece en Vardenia tiene su propio acuerdo con nosotros, firmado en papel o acordado por correo electrónico, que cubre su nivel, la comisión, la factura mensual, el plazo que tiene para impugnar una visita que figure en ella y el plazo que tiene para pagar. Estas condiciones no cambian ese acuerdo.',
        ],
      },
      {
        heading: 'Nuestro contenido',
        body: [
          'Los textos, la fotografía, el diseño y el material impreso de Vardenia nos pertenecen a nosotros o a las personas que nos los cedieron con licencia. Puedes leerlos, compartirlos y enlazarlos libremente. No puedes volver a publicarlos con fines comerciales sin pedirnos permiso.',
          'Los nombres y logotipos de los locales pertenecen a esos locales.',
        ],
      },
      {
        heading: 'Cuando algo sale mal',
        body: [
          'Ponemos un cuidado razonable en que la información de aquí sea exacta, pero los horarios cambian, las cocinas cierran y los locales se mudan. No podemos prometer que el sitio sea siempre correcto ni que esté siempre disponible.',
          '- **De qué somos responsables.** Nada en estas condiciones limita nuestra responsabilidad por fraude o por falta grave por nuestra parte.',
          '- **De qué no somos responsables.** Lo que un lugar de la guía haga o deje de hacer, incluida una reserva que no respete; un lugar que haya cerrado, se haya mudado o haya cambiado de horario desde que escribimos sobre él; y que el sitio no esté disponible durante un tiempo.',
          '- **Cuando somos responsables**, lo somos del daño directo que sufriste y que podía preverse razonablemente, no de un daño indirecto como una oportunidad perdida.',
        ],
      },
      {
        heading: 'Ley aplicable',
        body: [
          'Estas condiciones se rigen por la ley libanesa, y los tribunales libaneses conocen de cualquier disputa sobre ellas.',
          'Antes de acudir a los tribunales, escríbenos. La mayoría de los desacuerdos se resuelven con un mensaje.',
          email,
        ],
      },
      {
        heading: 'Cambios',
        body: [
          'Podemos actualizar estas condiciones. Si un cambio es relevante, lo diremos en esta página y actualizaremos la fecha de arriba. Seguir usando el sitio después de eso significa que se aplican las nuevas condiciones.',
        ],
      },
    ],
  },
}

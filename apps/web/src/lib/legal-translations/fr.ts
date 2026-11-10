import type { LegalEdition } from '../legal'
import { CONTACT, COMMERCIAL_REGISTRATION_NUMBER } from '../contact'
import { TBD, contactEmail } from '../placeholder'

/** The privacy policy and terms in French. A translation of lib/legal, which governs. */

const office = CONTACT.postalAddress
  ? `Le site est exploité par Vardenia, dont le siège social est situé à l'adresse suivante : ${CONTACT.postalAddress}.`
  : TBD('the registered office address of Vardenia, which runs the site')
const registration = `Numéro d'immatriculation au registre du commerce de Vardenia : ${COMMERCIAL_REGISTRATION_NUMBER}.`
const email = contactEmail('fr')

export const fr: LegalEdition = {
  privacyDescription: 'Comment Vardenia traite vos informations.',
  termsDescription: 'Les conditions que vous acceptez en utilisant Vardenia.',
  lastUpdated: 'Dernière mise à jour',
  translationNote:
    "Ceci est une traduction du texte anglais. En cas de différence entre les deux, c'est la version anglaise qui s'applique.",
  readInEnglish: 'Lire en anglais',

  privacy: {
    title: 'Politique de confidentialité',
    intro:
      "Cette politique explique ce que Vardenia collecte à votre sujet, pourquoi, et ce que vous pouvez nous demander d'en faire. Elle décrit le site tel qu'il fonctionne réellement, et non une déclaration d'intention générale.",
    sections: [
      {
        heading: 'Qui nous sommes',
        body: [
          'Vardenia est un magazine imprimé et un annuaire en ligne de lieux au Liban.',
          office,
          registration,
          'Pour toute question sur cette politique, contactez-nous.',
          email,
        ],
      },
      {
        heading: 'Ce que nous collectons',
        body: [
          'Uniquement ce dont le site a besoin pour faire ce que vous lui demandez.',
          "- **Si vous ouvrez un compte** : votre nom, votre adresse e-mail et, si vous choisissez de le donner, un numéro de téléphone. Votre mot de passe n'est conservé que sous forme de hachage : nous ne pouvons ni le lire ni le récupérer.",
          "- **Si vous réservez** : la date et l'heure, le nombre de personnes et tout ce que vous écrivez dans le champ de remarques. Nous conservons aussi un numéro de référence pour que vous et l'établissement puissiez retrouver la réservation plus tard.",
          '- **Après votre visite** : nous vous envoyons un e-mail pour vous demander si vous y êtes allé, et combien vous avez dépensé environ. Nous conservons votre réponse et le montant avec la réservation.',
          "- **Si vous envoyez un reçu** : la photo ou le PDF de l'addition, le total et la devise que vous confirmez, et ce qui en a été lu automatiquement (le total, le numéro du reçu, la date qui y est imprimée, et si le nom du lieu y figure). Un reçu peut montrer plus que le total, comme ce que vous avez commandé, un nom ou les derniers chiffres d'une carte : masquez avant l'envoi tout ce que vous préférez que nous ne voyions pas.",
          "- **Si vous écrivez un avis** : ce que vous avez écrit, votre note, ainsi que le prénom et l'initiale avec lesquels il est affiché.",
          '- **Votre passeport et vos lieux enregistrés** : les lieux que vous avez visités grâce à une réservation, qui vous valent un tampon, et les lieux que vous avez enregistrés.',
          "- **Si vous scannez un code imprimé** : le code, l'heure, votre ville et votre pays, et si vous étiez sur un téléphone ou un ordinateur. Nous n'enregistrons pas votre position précise, et nous ne conservons pas du tout votre adresse IP : elle est hachée en mémoire pour repérer les scans répétés et n'est jamais écrite.",
          "- **Si vous nous écrivez**, par e-mail ou via le bouton WhatsApp : votre message, l'adresse ou le numéro d'où il vient, et notre réponse.",
          "- **Si quelque chose ne fonctionne pas** : un enregistrement de l'erreur, dont les adresses e-mail, mots de passe et jetons d'accès sont automatiquement retirés avant sa conservation.",
          "- **Quand vous lisez une page** : les pages consultées, le site d'où venait la visite, le pays d'origine, et s'il s'agissait d'un téléphone ou d'un ordinateur. Cette mesure est faite pour nous par un prestataire d'analyse d'audience, sans aucun cookie, et les visites sont comptées sans vous être rattachées.",
          "- **Chaque visite** passe par le réseau qui protège le site contre les attaques et qui, comme tout réseau, voit l'adresse depuis laquelle vous vous connectez. Quand vous ouvrez un compte, il vérifie aussi que vous êtes une personne et non un programme.",
          "- **La vitesse de chargement des pages** : pour les visiteurs situés hors de l'Union européenne, le réseau qui achemine le site mesure aussi la rapidité avec laquelle chaque page se charge et répond, de quelle page il s'agit, le navigateur et le pays, et compte la visite. Il ne dépose aucun cookie et cela ne vous est pas rattaché.",
          "Nous n'utilisons aucun traceur publicitaire, nous ne construisons pas de profil de vous, et rien ici ne vous suit sur un autre site.",
        ],
      },
      {
        heading: 'À propos du champ de remarques de la réservation',
        body: [
          "Le champ de remarques du formulaire de réservation vous permet de signaler au lieu un besoin alimentaire, un anniversaire ou un besoin d'accessibilité, comme un fauteuil roulant. Certaines de ces informations sont des données de santé, que la loi libanaise (loi n° 81 de 2018 relative aux transactions électroniques et aux données à caractère personnel, article 91) ne nous permet de traiter qu'avec votre accord explicite.",
          '- **Il est facultatif.** Laissez-le vide et votre demande de réservation reste exactement la même. Vous pouvez toujours le dire au lieu en personne.',
          "- **Si vous y écrivez, vous cochez une case pour accepter** que Vardenia et le lieu utilisent ce que vous avez écrit, y compris toute information de santé, uniquement pour organiser cette visite. La case n'est jamais cochée à votre place, et les remarques ne sont pas envoyées sans elle.",
          "- **Qui la reçoit.** Le lieu où vous réservez, et l'équipe Vardenia. Personne d'autre.",
          '- **Combien de temps elle est conservée.** Avec la réservation, pendant 12 mois après la visite.',
          '- **Vos droits.** Vous pouvez nous demander de vous montrer ce que vous avez écrit, de le corriger ou de le supprimer.',
          "N'écrivez que ce que vous êtes à l'aise de partager avec ce lieu.",
        ],
      },
      {
        heading: 'Votre réponse après une visite, et votre reçu',
        body: [
          "Les établissements présents sur Vardenia nous versent une commission sur ce que leurs clients dépensent lors des visites réservées par le site. Votre visite ne vous coûte rien de plus : vous payez l'établissement comme d'habitude, et Vardenia ne vous facture rien.",
          "C'est pourquoi nous vous demandons si vous y êtes allé, et combien vous avez dépensé environ, et pourquoi vous pouvez nous envoyer le reçu. Cela nous permet de vérifier qu'un établissement est facturé équitablement, et de trancher quand l'établissement et vous ne vous souvenez pas de la visite de la même façon. Répondre est votre choix, envoyer un reçu aussi.",
          "- **Qui voit le reçu.** Vous, et l'équipe Vardenia. L'établissement ne voit jamais la photo. Il voit seulement le montant sur lequel il a été facturé, et que celui-ci provient d'un reçu.",
          "- **La lecture automatique.** Quand vous choisissez la photo, le total, le numéro du reçu, la date et le nom du lieu peuvent en être lus par un service automatisé, pour que vous n'ayez qu'à vérifier le chiffre. Vous pouvez toujours corriger le total avant l'envoi, et aucune décision vous concernant n'en découle.",
          "- **Chaque reçu ne compte qu'une fois.** Le numéro du reçu est lu pour que le même reçu ne puisse pas être envoyé deux fois pour le même lieu. Un reçu déjà envoyé est refusé.",
          "- **Qui voit votre réponse.** L'équipe Vardenia. Si elle contredit ce que l'établissement a enregistré, nous pouvons lui indiquer que la visite est contestée le temps d'examiner la question.",
          '- **Combien de temps ils sont conservés.** Le reçu, ce qui en a été lu et le montant que vous avez indiqué sont conservés 12 mois après la visite. Le fait que vous soyez venu reste attaché à la visite, pour votre passeport.',
        ],
      },
      {
        heading: 'Pourquoi nous avons le droit de les détenir',
        body: [
          "- **Pour faire ce que vous avez demandé.** Effectuer une réservation, gérer votre compte et vous envoyer la confirmation font partie de l'accord entre nous.",
          "- **Pour faire fonctionner l'entreprise.** Compter les scans d'un code imprimé indique à un annonceur si son emplacement a fonctionné, et votre réponse après une visite ainsi que votre reçu nous indiquent ce que doit un établissement. Les chiffres de scans sont agrégés et n'identifient jamais un lecteur.",
          '- **Pour que le site fonctionne en toute sécurité.** Limiter le nombre de requêtes, repérer les abus automatisés et enregistrer les erreurs.',
        ],
      },
      {
        heading: 'Qui d’autre les voit',
        body: [
          "- **L'établissement où vous réservez** voit votre nom, votre numéro de téléphone si vous l'avez donné, les détails de la réservation et vos remarques. Il en a besoin pour garder votre table et vous appeler en cas de changement. Il ne voit ni votre adresse e-mail, ni votre reçu, ni votre réponse après la visite.",
          "- **Tous les lecteurs du site** voient un avis une fois que nous l'avons publié, avec votre prénom et votre initiale, jamais votre nom complet ni quoi que ce soit d'autre vous concernant.",
          "- **Nos prestataires**, qui traitent les données pour notre compte et n'ont pas le droit de les utiliser à d'autres fins : l'hébergeur de notre base de données et de nos fichiers, l'hébergeur de notre site, le réseau qui protège le site et mesure sa vitesse de chargement, le service qui envoie nos e-mails, le service qui héberge notre boîte de réception, le service qui compte les visites des pages, et le service qui lit les reçus. Vous pouvez nous demander qui ils sont.",
          '- **WhatsApp**, si vous nous écrivez via le bouton WhatsApp. La conversation passe par WhatsApp, qui la traite selon sa propre politique de confidentialité.',
          "Nous ne vendons pas vos informations, et nous ne les partageons pas pour le marketing de qui que ce soit d'autre.",
        ],
      },
      {
        heading: 'Où elles sont conservées',
        body: [
          "Notre base de données et les fichiers des reçus sont hébergés dans l'Union européenne, à Francfort. Notre hébergeur web, notre fournisseur réseau, nos fournisseurs d'e-mail, le service qui compte les visites des pages et WhatsApp peuvent traiter des données en dehors de celle-ci, et un reçu lu automatiquement est lu aux États-Unis.",
          "L'hébergeur de notre base de données conserve une sauvegarde quotidienne pendant sept jours. Chaque semaine, nous gardons aussi une copie complète de la base de données et de chaque photo et reçu sur un ordinateur que nous contrôlons, hors de l'Union européenne, pour que rien ne soit perdu si un prestataire fait défaut.",
          "Lorsque des données quittent l'Union européenne, nous nous appuyons sur le cadre de protection des données UE-États-Unis (EU-US Data Privacy Framework) lorsque le prestataire y est certifié, et sinon sur les clauses contractuelles types de la Commission européenne prévues dans notre contrat avec ce prestataire.",
          "Notre copie hebdomadaire est chiffrée avant d'être stockée, et seule Vardenia détient la clé qui permet de l'ouvrir.",
        ],
      },
      {
        heading: 'Combien de temps nous les conservons',
        body: [
          'Seulement le temps nécessaire à la raison pour laquelle nous les détenons.',
          '- **Les réservations**, y compris vos remarques : 12 mois après la visite. Une réservation devenue une visite est alors réduite au lieu, à la date, au nombre de personnes et au fait que vous êtes venu, pour que son tampon reste dans votre passeport jusqu’à la fermeture de votre compte.',
          '- **Les reçus**, ce qui en a été lu, et le montant que vous avez indiqué après une visite : 12 mois après la visite.',
          '- **Les enregistrements de scans de codes imprimés** : 12 mois.',
          '- **Les enregistrements d’erreurs** : 90 jours.',
          "- **Votre compte** : jusqu'à ce que vous le fermiez.",
          "- **Les avis** : tant qu'ils sont publiés, ou jusqu'à ce que vous nous demandiez d'en retirer un.",
          '- **Les messages que vous nous envoyez** par e-mail ou sur WhatsApp : le temps nécessaire pour vous répondre et assurer le suivi.',
          "- **Les factures mensuelles adressées aux établissements** : dix ans, comme l'exige la loi libanaise pour les documents comptables d'une entreprise. Une facture indique chaque visite par sa référence de réservation, sa date et son montant, jamais par le nom d'un client.",
        ],
      },
      {
        heading: 'Ce que vous pouvez demander',
        body: [
          "Vous pouvez nous demander une copie de ce que nous détenons à votre sujet, de le corriger, de le supprimer, de vous l'envoyer dans un format portable, ou de cesser de l'utiliser d'une certaine manière.",
          'Demandez-le-nous, et nous vous répondrons dans un délai d’un mois.',
          email,
          "Si vous n'êtes pas satisfait de la manière dont nous avons traité votre demande, vous pouvez déposer une réclamation auprès de l'autorité nationale de protection des données de votre pays.",
        ],
      },
      {
        heading: 'Cookies',
        body: [
          "Deux petits cookies, et seulement une fois que vous êtes connecté. L'un vous garde connecté ; l'autre indique seulement à la page d'afficher le lien vers votre compte au lieu de « Se connecter ». Aucun des deux ne sert à vous suivre, aucun n'est partagé, et il n'y a sur ce site aucun cookie publicitaire ni de mesure d'audience.",
          "Ce dernier point est délibéré. Nous comptons bien les visites des pages, et nous avons choisi un prestataire qui n'a besoin d'aucun cookie pour le faire : mesurer la façon dont le site est lu ne vous coûte rien et ne vous demande rien.",
          "Comme les deux sont strictement nécessaires pour fournir quelque chose que vous avez demandé, il n'y a pas de bandeau de consentement. Si nous ajoutons un jour quoi que ce soit qui ne soit pas strictement nécessaire, il y en aura un.",
          "Le réseau qui achemine chaque visite, et qui effectue la vérification sur le formulaire d'inscription, ne dépose lui non plus aucun cookie sur ce site.",
        ],
      },
      {
        heading: 'Enfants',
        body: [
          "Vardenia ne s'adresse pas aux enfants et nous ne collectons sciemment aucune information à leur sujet. Si vous pensez qu'un enfant nous a donné des informations, écrivez-nous et nous les supprimerons.",
        ],
      },
      {
        heading: 'Modifications',
        body: [
          "Si nous modifions cette politique de manière importante, nous l'indiquerons sur cette page et mettrons à jour la date en haut. Les versions antérieures peuvent être obtenues sur demande.",
        ],
      },
    ],
  },

  terms: {
    title: "Conditions d'utilisation",
    intro:
      "Ces conditions couvrent l'utilisation du site Vardenia, l'ouverture d'un compte, la demande de réservation, et ce que vous nous envoyez ensuite : votre réponse sur la visite, un reçu ou un avis. Lisez en particulier la section sur les réservations, car elle explique avec qui votre accord est réellement conclu.",
    sections: [
      {
        heading: 'Qui nous sommes',
        body: [
          'Vardenia publie un magazine imprimé et un annuaire en ligne de lieux au Liban.',
          office,
          registration,
        ],
      },
      {
        heading: "Ce qu'est Vardenia, et ce qu'elle n'est pas",
        body: [
          'Nous sommes un guide. Nous choisissons chaque lieu qui apparaît ici, et nous écrivons nous-mêmes à leur sujet. Un établissement ne peut pas modifier ce que nous disons de lui.',
          "Nous ne sommes ni l'hôtel, ni le restaurant, ni le lieu. Nous ne les possédons pas, ne les gérons pas et ne les supervisons pas, et nous ne pouvons pas garantir votre expérience sur place.",
        ],
      },
      {
        heading: 'Comment les lieux sont référencés et classés',
        body: [
          "Chaque lieu ici a été choisi par nous. Payer ne permet pas d'y entrer : un lieu que nous avons choisi paie ensuite Vardenia pour être référencé, à l'un de trois niveaux : bronze, une fiche sur le site ; argent, qui ajoute une page dans le magazine imprimé ; et or, qui ajoute la première place dans chaque liste et une place sur la page d'accueil.",
          "- **L'ordre d'une liste reflète ce niveau.** Les lieux or viennent en premier, puis argent, puis bronze, et les lieux d'un même niveau sont classés par ordre alphabétique. Un lieu placé plus haut a payé pour un niveau supérieur ; il n'est pas classé comme meilleur.",
          "- **Le bandeau en haut de la page d'accueil** présente des lieux or. Il s'agit d'un emplacement payant, signalé comme choisi par les lieux qui soutiennent ce guide.",
          "- **Chaque lieu ici a été visité et vérifié par nous en personne** avant d'apparaître.",
          '- **Les lieux paient aussi une commission** sur ce que les clients dépensent lors des visites réservées par Vardenia. Cela ne change pas ce que vous payez.',
          "Les lieux suggérés en bas d'une fiche sont d'abord les plus proches, quel que soit leur niveau.",
        ],
      },
      {
        heading: 'Réservations',
        body: [
          "C'est la partie qui mérite d'être lue deux fois.",
          "- **Votre réservation est conclue avec l'établissement, pas avec nous.** Nous transmettons votre demande et vous communiquons sa réponse. L'accord pour garder une table est entre vous deux.",
          "- **Une demande n'est pas une réservation.** Certains lieux confirment immédiatement, d'autres répondent manuellement. Rien n'est retenu tant que vous n'avez pas reçu une confirmation qui le dit, et une demande peut être refusée.",
          "- **Annulation.** Vous pouvez annuler depuis votre compte à tout moment, et l'établissement en est informé.",
          "- **Les frais d'annulation tardive ou de réservation non honorée** dépendent du lieu. Certains lieux en appliquent, d'autres non. De tels frais relèvent de la politique propre du lieu, entre vous et lui.",
          "- Nous n'encaissons aucun paiement pour les réservations et ne conservons aucune donnée de carte.",
        ],
      },
      {
        heading: 'Après votre visite : votre réponse et votre reçu',
        body: [
          'Après une visite réservée par Vardenia, nous vous envoyons un e-mail pour vous demander si vous y êtes allé et combien vous avez dépensé environ, et vous pouvez nous envoyer le reçu. Les deux sont à votre choix.',
          "- **Répondez honnêtement.** Votre réponse nous sert à vérifier ce qui est facturé à l'établissement : ne dites donc que vous y êtes allé que si c'est le cas. Votre première réponse est définitive, et vous pouvez la donner pendant 30 jours après la visite.",
          "- **N'envoyez que votre propre reçu, et le vrai.** Ce doit être l'addition de cette visite. Quand vous choisissez la photo, le total peut en être lu automatiquement ; vérifiez le chiffre avant de l'envoyer, et corrigez-le s'il est faux.",
          "- **Désaccords.** Si votre version de la visite et celle de l'établissement diffèrent, l'équipe Vardenia examine les deux, ainsi que le reçu s'il y en a un, et tranche. Nous pouvons interroger l'un ou l'autre d'entre vous à ce sujet.",
          'Nous pouvons refuser, ou cesser de prendre en compte, un reçu ou une réponse qui semble faux, et suspendre un compte qui en envoie.',
        ],
      },
      {
        heading: 'Votre passeport',
        body: [
          "Chaque visite effectuée grâce à une réservation, et confirmée par l'établissement, vous vaut un tampon dans votre passeport Vardenia.",
          "- Un tampon est une trace de la visite, et non de l'argent ni un bon d'achat ; il n'a aucune valeur monétaire.",
          "- Un tampon peut être retiré s'il s'avère que la visite n'a pas eu lieu, par exemple après le règlement d'un litige en faveur de l'établissement.",
        ],
      },
      {
        heading: 'Avis',
        body: [
          'Vous pouvez donner votre avis sur un lieu une fois terminée une visite réservée par Vardenia.',
          '- **Nous lisons chaque avis avant sa publication**, et pouvons refuser un avis qui ne porte pas sur une vraie visite, qui est injurieux ou qui révèle des informations personnelles.',
          '- **Il est affiché avec votre prénom et votre initiale.**',
          "- **En l'envoyant, vous nous autorisez** à le publier sur le site Vardenia, avec le lieu qu'il concerne, pendant toute la durée de sa publication. Vous pouvez nous demander de le retirer.",
          "- **Il n'apparaît que sur le site.** Nous n'imprimons pas d'avis dans le magazine et ne les utilisons pas dans la publicité.",
        ],
      },
      {
        heading: 'Votre compte',
        body: [
          "Vous êtes responsable de ce qui se passe sous votre compte : gardez votre mot de passe pour vous et prévenez-nous si vous pensez que quelqu'un d'autre le connaît.",
          "Donnez-nous des informations exactes. Une réservation faite sous un nom ou un numéro qui n'est pas réel, c'est une table qu'un établissement garde pour personne.",
          'Vous pouvez nous demander de fermer votre compte à tout moment.',
        ],
      },
      {
        heading: 'Utiliser le site loyalement',
        body: [
          "Merci de ne pas faire de réservations que vous n'avez pas l'intention d'honorer, de ne pas envoyer de réponses ou de reçus inexacts, de ne pas tenter d'accéder à des parties du site qui ne vous appartiennent pas, de ne pas extraire l'annuaire de manière automatisée, et de ne pas utiliser le site pour enfreindre la loi ou harceler qui que ce soit.",
          'Nous pouvons suspendre un compte qui fait l’une de ces choses.',
        ],
      },
      {
        heading: 'Si vous gérez un établissement référencé',
        body: [
          "Ces conditions s'adressent aux lecteurs et aux clients. Un établissement référencé sur Vardenia a son propre accord avec nous, signé sur papier ou conclu par e-mail, qui couvre son niveau, la commission, la facture mensuelle, le délai dont il dispose pour contester une visite qui y figure, et le délai dont il dispose pour payer. Ces conditions ne modifient pas cet accord.",
        ],
      },
      {
        heading: 'Notre contenu',
        body: [
          "Les textes, photographies, le design et les documents imprimés de Vardenia nous appartiennent ou appartiennent aux personnes qui nous en ont concédé la licence. Vous êtes libre de les lire, de les partager et d'y faire un lien. Vous ne pouvez pas les republier à des fins commerciales sans nous le demander.",
          'Les noms et logos des établissements appartiennent à ces établissements.',
        ],
      },
      {
        heading: 'Quand quelque chose ne va pas',
        body: [
          "Nous veillons raisonnablement à l'exactitude des informations publiées ici, mais les horaires changent, les cuisines ferment et les établissements déménagent. Nous ne pouvons pas promettre que le site soit toujours exact ni toujours disponible.",
          '- **Ce dont nous sommes responsables.** Rien dans ces conditions ne limite notre responsabilité en cas de fraude ou de faute grave de notre part.',
          "- **Ce dont nous ne sommes pas responsables.** Ce qu'un lieu référencé fait ou ne fait pas, y compris une réservation qu'il n'honore pas ; un lieu qui a fermé, déménagé ou changé ses horaires depuis que nous avons écrit à son sujet ; et l'indisponibilité temporaire du site.",
          "- **Lorsque nous sommes responsables**, c'est du préjudice direct que vous avez subi et qui pouvait raisonnablement être prévu, et non d'un préjudice indirect tel qu'une occasion perdue.",
        ],
      },
      {
        heading: 'Droit applicable',
        body: [
          'Ces conditions sont régies par le droit libanais, et les tribunaux libanais sont compétents pour tout litige les concernant.',
          "Avant d'aller en justice, écrivez-nous. La plupart des désaccords se règlent par un message.",
          email,
        ],
      },
      {
        heading: 'Modifications',
        body: [
          "Nous pouvons mettre à jour ces conditions. Si une modification est importante, nous l'indiquerons sur cette page et mettrons à jour la date en haut. Continuer à utiliser le site après cela signifie que les nouvelles conditions s'appliquent.",
        ],
      },
    ],
  },
}

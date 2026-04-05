/**
 * Icon registry -- imports required icons from every pack/weight and
 * registers them with the FontAwesome SVG core library.
 *
 * This file must be imported once at app startup (before any Icon component
 * renders) so that `findIconDefinition` can resolve icons by prefix + name.
 *
 * Pro+ packs have smaller icon sets; missing icons fall back to Sharp Solid
 * at render time (handled by the Icon component).
 */

import { library } from '@fortawesome/fontawesome-svg-core';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

// ---------------------------------------------------------------------------
// Sharp (default)
// ---------------------------------------------------------------------------

import {
  faHouse as sassHouse, faMessage as sassMessage, faReply as sassReply, faUsers as sassUsers,
  faGear as sassGear, faCircleInfo as sassCircleInfo, faDownload as sassDownload,
  faRightFromBracket as sassLogout, faShieldCheck as sassShield,
  faKey as sassKey, faBell as sassBell, faMagnifyingGlass as sassSearch,
  faUser as sassUser, faPalette as sassPalette, faLock as sassLock,
  faMask as sassMask, faPlus as sassPlus, faCheck as sassCheck,
  faClock as sassClock, faXmark as sassX, faGrid2 as sassSpaces,
  faEllipsis as sassEllipsis, faFaceSmile as sassSmile,
  faFaceSmilePlus as sassSmilePlus, faPaperPlane as sassSend,
  faTrash as sassTrash, faFileExport as sassFileExport,
  faFileImport as sassFileImport, faChevronDown as sassChevronDown,
  faChevronRight as sassChevronRight, faChevronUp as sassChevronUp,
  faCamera as sassCamera, faImage as sassImage, faGlobe as sassGlobe,
  faDesktop as sassDesktop, faBars as sassBars, faEye as sassEye,
  faThumbsUp as sassThumbsUp, faTriangleExclamation as sassWarning,
  faCircleCheck as sassSuccess, faCircleXmark as sassError,
  faBadgeCheck as sassBadge, faFileArrowDown as sassFileDown,
  faFileArrowUp as sassFileUp, faArrowLeft as sassArrowLeft,
  faCircle as sassCircle, faPen as sassPen,
} from '@awesome.me/kit-888aad49e1/icons/sharp/solid';

import {
  faHouse as sasrHouse, faMessage as sasrMessage, faReply as sasrReply, faUsers as sasrUsers,
  faGear as sasrGear, faCircleInfo as sasrCircleInfo, faDownload as sasrDownload,
  faRightFromBracket as sasrLogout, faShieldCheck as sasrShield,
  faKey as sasrKey, faBell as sasrBell, faMagnifyingGlass as sasrSearch,
  faUser as sasrUser, faPalette as sasrPalette, faLock as sasrLock,
  faMask as sasrMask, faPlus as sasrPlus, faCheck as sasrCheck,
  faClock as sasrClock, faXmark as sasrX, faGrid2 as sasrSpaces,
  faEllipsis as sasrEllipsis, faFaceSmile as sasrSmile,
  faFaceSmilePlus as sasrSmilePlus, faPaperPlane as sasrSend,
  faTrash as sasrTrash, faFileExport as sasrFileExport,
  faFileImport as sasrFileImport, faChevronDown as sasrChevronDown,
  faChevronRight as sasrChevronRight, faChevronUp as sasrChevronUp,
  faCamera as sasrCamera, faImage as sasrImage, faGlobe as sasrGlobe,
  faDesktop as sasrDesktop, faBars as sasrBars, faEye as sasrEye,
  faThumbsUp as sasrThumbsUp, faTriangleExclamation as sasrWarning,
  faCircleCheck as sasrSuccess, faCircleXmark as sasrError,
  faBadgeCheck as sasrBadge, faFileArrowDown as sasrFileDown,
  faFileArrowUp as sasrFileUp, faArrowLeft as sasrArrowLeft,
  faCircle as sasrCircle, faPen as sasrPen,
} from '@awesome.me/kit-888aad49e1/icons/sharp/regular';

import {
  faHouse as saslHouse, faMessage as saslMessage, faReply as saslReply, faUsers as saslUsers,
  faGear as saslGear, faCircleInfo as saslCircleInfo, faDownload as saslDownload,
  faRightFromBracket as saslLogout, faShieldCheck as saslShield,
  faKey as saslKey, faBell as saslBell, faMagnifyingGlass as saslSearch,
  faUser as saslUser, faPalette as saslPalette, faLock as saslLock,
  faMask as saslMask, faPlus as saslPlus, faCheck as saslCheck,
  faClock as saslClock, faXmark as saslX, faGrid2 as saslSpaces,
  faEllipsis as saslEllipsis, faFaceSmile as saslSmile,
  faFaceSmilePlus as saslSmilePlus, faPaperPlane as saslSend,
  faTrash as saslTrash, faFileExport as saslFileExport,
  faFileImport as saslFileImport, faChevronDown as saslChevronDown,
  faChevronRight as saslChevronRight, faChevronUp as saslChevronUp,
  faCamera as saslCamera, faImage as saslImage, faGlobe as saslGlobe,
  faDesktop as saslDesktop, faBars as saslBars, faEye as saslEye,
  faThumbsUp as saslThumbsUp, faTriangleExclamation as saslWarning,
  faCircleCheck as saslSuccess, faCircleXmark as saslError,
  faBadgeCheck as saslBadge, faFileArrowDown as saslFileDown,
  faFileArrowUp as saslFileUp, faArrowLeft as saslArrowLeft,
  faCircle as saslCircle, faPen as saslPen,
} from '@awesome.me/kit-888aad49e1/icons/sharp/light';

import {
  faHouse as satHouse, faMessage as satMessage, faReply as satReply, faUsers as satUsers,
  faGear as satGear, faCircleInfo as satCircleInfo, faDownload as satDownload,
  faRightFromBracket as satLogout, faShieldCheck as satShield,
  faKey as satKey, faBell as satBell, faMagnifyingGlass as satSearch,
  faUser as satUser, faPalette as satPalette, faLock as satLock,
  faMask as satMask, faPlus as satPlus, faCheck as satCheck,
  faClock as satClock, faXmark as satX, faGrid2 as satSpaces,
  faEllipsis as satEllipsis, faFaceSmile as satSmile,
  faFaceSmilePlus as satSmilePlus, faPaperPlane as satSend,
  faTrash as satTrash, faFileExport as satFileExport,
  faFileImport as satFileImport, faChevronDown as satChevronDown,
  faChevronRight as satChevronRight, faChevronUp as satChevronUp,
  faCamera as satCamera, faImage as satImage, faGlobe as satGlobe,
  faDesktop as satDesktop, faBars as satBars, faEye as satEye,
  faThumbsUp as satThumbsUp, faTriangleExclamation as satWarning,
  faCircleCheck as satSuccess, faCircleXmark as satError,
  faBadgeCheck as satBadge, faFileArrowDown as satFileDown,
  faFileArrowUp as satFileUp, faArrowLeft as satArrowLeft,
  faCircle as satCircle, faPen as satPen,
} from '@awesome.me/kit-888aad49e1/icons/sharp/thin';

// ---------------------------------------------------------------------------
// Classic
// ---------------------------------------------------------------------------

import {
  faHouse as fasHouse, faMessage as fasMessage, faReply as fasReply, faUsers as fasUsers,
  faGear as fasGear, faCircleInfo as fasCircleInfo, faDownload as fasDownload,
  faRightFromBracket as fasLogout, faShieldCheck as fasShield,
  faKey as fasKey, faBell as fasBell, faMagnifyingGlass as fasSearch,
  faUser as fasUser, faPalette as fasPalette, faLock as fasLock,
  faMask as fasMask, faPlus as fasPlus, faCheck as fasCheck,
  faClock as fasClock, faXmark as fasX, faGrid2 as fasSpaces,
  faEllipsis as fasEllipsis, faFaceSmile as fasSmile,
  faFaceSmilePlus as fasSmilePlus, faPaperPlane as fasSend,
  faTrash as fasTrash, faFileExport as fasFileExport,
  faFileImport as fasFileImport, faChevronDown as fasChevronDown,
  faChevronRight as fasChevronRight, faChevronUp as fasChevronUp,
  faCamera as fasCamera, faImage as fasImage, faGlobe as fasGlobe,
  faDesktop as fasDesktop, faBars as fasBars, faEye as fasEye,
  faThumbsUp as fasThumbsUp, faTriangleExclamation as fasWarning,
  faCircleCheck as fasSuccess, faCircleXmark as fasError,
  faBadgeCheck as fasBadge, faFileArrowDown as fasFileDown,
  faFileArrowUp as fasFileUp, faArrowLeft as fasArrowLeft,
  faCircle as fasCircle, faPen as fasPen,
} from '@awesome.me/kit-888aad49e1/icons/classic/solid';

import {
  faHouse as farHouse, faMessage as farMessage, faReply as farReply, faUsers as farUsers,
  faGear as farGear, faCircleInfo as farCircleInfo, faDownload as farDownload,
  faRightFromBracket as farLogout, faShieldCheck as farShield,
  faKey as farKey, faBell as farBell, faMagnifyingGlass as farSearch,
  faUser as farUser, faPalette as farPalette, faLock as farLock,
  faMask as farMask, faPlus as farPlus, faCheck as farCheck,
  faClock as farClock, faXmark as farX, faGrid2 as farSpaces,
  faEllipsis as farEllipsis, faFaceSmile as farSmile,
  faFaceSmilePlus as farSmilePlus, faPaperPlane as farSend,
  faTrash as farTrash, faFileExport as farFileExport,
  faFileImport as farFileImport, faChevronDown as farChevronDown,
  faChevronRight as farChevronRight, faChevronUp as farChevronUp,
  faCamera as farCamera, faImage as farImage, faGlobe as farGlobe,
  faDesktop as farDesktop, faBars as farBars, faEye as farEye,
  faThumbsUp as farThumbsUp, faTriangleExclamation as farWarning,
  faCircleCheck as farSuccess, faCircleXmark as farError,
  faBadgeCheck as farBadge, faFileArrowDown as farFileDown,
  faFileArrowUp as farFileUp, faArrowLeft as farArrowLeft,
  faCircle as farCircle, faPen as farPen,
} from '@awesome.me/kit-888aad49e1/icons/classic/regular';

import {
  faHouse as falHouse, faMessage as falMessage, faReply as falReply, faUsers as falUsers,
  faGear as falGear, faCircleInfo as falCircleInfo, faDownload as falDownload,
  faRightFromBracket as falLogout, faShieldCheck as falShield,
  faKey as falKey, faBell as falBell, faMagnifyingGlass as falSearch,
  faUser as falUser, faPalette as falPalette, faLock as falLock,
  faMask as falMask, faPlus as falPlus, faCheck as falCheck,
  faClock as falClock, faXmark as falX, faGrid2 as falSpaces,
  faEllipsis as falEllipsis, faFaceSmile as falSmile,
  faFaceSmilePlus as falSmilePlus, faPaperPlane as falSend,
  faTrash as falTrash, faFileExport as falFileExport,
  faFileImport as falFileImport, faChevronDown as falChevronDown,
  faChevronRight as falChevronRight, faChevronUp as falChevronUp,
  faCamera as falCamera, faImage as falImage, faGlobe as falGlobe,
  faDesktop as falDesktop, faBars as falBars, faEye as falEye,
  faThumbsUp as falThumbsUp, faTriangleExclamation as falWarning,
  faCircleCheck as falSuccess, faCircleXmark as falError,
  faBadgeCheck as falBadge, faFileArrowDown as falFileDown,
  faFileArrowUp as falFileUp, faArrowLeft as falArrowLeft,
  faCircle as falCircle, faPen as falPen,
} from '@awesome.me/kit-888aad49e1/icons/classic/light';

import {
  faHouse as fatHouse, faMessage as fatMessage, faReply as fatReply, faUsers as fatUsers,
  faGear as fatGear, faCircleInfo as fatCircleInfo, faDownload as fatDownload,
  faRightFromBracket as fatLogout, faShieldCheck as fatShield,
  faKey as fatKey, faBell as fatBell, faMagnifyingGlass as fatSearch,
  faUser as fatUser, faPalette as fatPalette, faLock as fatLock,
  faMask as fatMask, faPlus as fatPlus, faCheck as fatCheck,
  faClock as fatClock, faXmark as fatX, faGrid2 as fatSpaces,
  faEllipsis as fatEllipsis, faFaceSmile as fatSmile,
  faFaceSmilePlus as fatSmilePlus, faPaperPlane as fatSend,
  faTrash as fatTrash, faFileExport as fatFileExport,
  faFileImport as fatFileImport, faChevronDown as fatChevronDown,
  faChevronRight as fatChevronRight, faChevronUp as fatChevronUp,
  faCamera as fatCamera, faImage as fatImage, faGlobe as fatGlobe,
  faDesktop as fatDesktop, faBars as fatBars, faEye as fatEye,
  faThumbsUp as fatThumbsUp, faTriangleExclamation as fatWarning,
  faCircleCheck as fatSuccess, faCircleXmark as fatError,
  faBadgeCheck as fatBadge, faFileArrowDown as fatFileDown,
  faFileArrowUp as fatFileUp, faArrowLeft as fatArrowLeft,
  faCircle as fatCircle, faPen as fatPen,
} from '@awesome.me/kit-888aad49e1/icons/classic/thin';

// ---------------------------------------------------------------------------
// DuoTone
// ---------------------------------------------------------------------------

import {
  faHouse as fadHouse, faMessage as fadMessage, faReply as fadReply, faUsers as fadUsers,
  faGear as fadGear, faCircleInfo as fadCircleInfo, faDownload as fadDownload,
  faRightFromBracket as fadLogout, faShieldCheck as fadShield,
  faKey as fadKey, faBell as fadBell, faMagnifyingGlass as fadSearch,
  faUser as fadUser, faPalette as fadPalette, faLock as fadLock,
  faMask as fadMask, faPlus as fadPlus, faCheck as fadCheck,
  faClock as fadClock, faXmark as fadX, faGrid2 as fadSpaces,
  faEllipsis as fadEllipsis, faFaceSmile as fadSmile,
  faFaceSmilePlus as fadSmilePlus, faPaperPlane as fadSend,
  faTrash as fadTrash, faFileExport as fadFileExport,
  faFileImport as fadFileImport, faChevronDown as fadChevronDown,
  faChevronRight as fadChevronRight, faChevronUp as fadChevronUp,
  faCamera as fadCamera, faImage as fadImage, faGlobe as fadGlobe,
  faDesktop as fadDesktop, faBars as fadBars, faEye as fadEye,
  faThumbsUp as fadThumbsUp, faTriangleExclamation as fadWarning,
  faCircleCheck as fadSuccess, faCircleXmark as fadError,
  faBadgeCheck as fadBadge, faFileArrowDown as fadFileDown,
  faFileArrowUp as fadFileUp, faArrowLeft as fadArrowLeft,
  faCircle as fadCircle, faPen as fadPen,
} from '@awesome.me/kit-888aad49e1/icons/duotone/solid';

import {
  faHouse as fadrHouse, faMessage as fadrMessage, faReply as fadrReply, faUsers as fadrUsers,
  faGear as fadrGear, faCircleInfo as fadrCircleInfo, faDownload as fadrDownload,
  faRightFromBracket as fadrLogout, faShieldCheck as fadrShield,
  faKey as fadrKey, faBell as fadrBell, faMagnifyingGlass as fadrSearch,
  faUser as fadrUser, faPalette as fadrPalette, faLock as fadrLock,
  faMask as fadrMask, faPlus as fadrPlus, faCheck as fadrCheck,
  faClock as fadrClock, faXmark as fadrX, faGrid2 as fadrSpaces,
  faEllipsis as fadrEllipsis, faFaceSmile as fadrSmile,
  faFaceSmilePlus as fadrSmilePlus, faPaperPlane as fadrSend,
  faTrash as fadrTrash, faFileExport as fadrFileExport,
  faFileImport as fadrFileImport, faChevronDown as fadrChevronDown,
  faChevronRight as fadrChevronRight, faChevronUp as fadrChevronUp,
  faCamera as fadrCamera, faImage as fadrImage, faGlobe as fadrGlobe,
  faDesktop as fadrDesktop, faBars as fadrBars, faEye as fadrEye,
  faThumbsUp as fadrThumbsUp, faTriangleExclamation as fadrWarning,
  faCircleCheck as fadrSuccess, faCircleXmark as fadrError,
  faBadgeCheck as fadrBadge, faFileArrowDown as fadrFileDown,
  faFileArrowUp as fadrFileUp, faArrowLeft as fadrArrowLeft,
  faCircle as fadrCircle, faPen as fadrPen,
} from '@awesome.me/kit-888aad49e1/icons/duotone/regular';

import {
  faHouse as fadlHouse, faMessage as fadlMessage, faReply as fadlReply, faUsers as fadlUsers,
  faGear as fadlGear, faCircleInfo as fadlCircleInfo, faDownload as fadlDownload,
  faRightFromBracket as fadlLogout, faShieldCheck as fadlShield,
  faKey as fadlKey, faBell as fadlBell, faMagnifyingGlass as fadlSearch,
  faUser as fadlUser, faPalette as fadlPalette, faLock as fadlLock,
  faMask as fadlMask, faPlus as fadlPlus, faCheck as fadlCheck,
  faClock as fadlClock, faXmark as fadlX, faGrid2 as fadlSpaces,
  faEllipsis as fadlEllipsis, faFaceSmile as fadlSmile,
  faFaceSmilePlus as fadlSmilePlus, faPaperPlane as fadlSend,
  faTrash as fadlTrash, faFileExport as fadlFileExport,
  faFileImport as fadlFileImport, faChevronDown as fadlChevronDown,
  faChevronRight as fadlChevronRight, faChevronUp as fadlChevronUp,
  faCamera as fadlCamera, faImage as fadlImage, faGlobe as fadlGlobe,
  faDesktop as fadlDesktop, faBars as fadlBars, faEye as fadlEye,
  faThumbsUp as fadlThumbsUp, faTriangleExclamation as fadlWarning,
  faCircleCheck as fadlSuccess, faCircleXmark as fadlError,
  faBadgeCheck as fadlBadge, faFileArrowDown as fadlFileDown,
  faFileArrowUp as fadlFileUp, faArrowLeft as fadlArrowLeft,
  faCircle as fadlCircle, faPen as fadlPen,
} from '@awesome.me/kit-888aad49e1/icons/duotone/light';

import {
  faHouse as fadtHouse, faMessage as fadtMessage, faReply as fadtReply, faUsers as fadtUsers,
  faGear as fadtGear, faCircleInfo as fadtCircleInfo, faDownload as fadtDownload,
  faRightFromBracket as fadtLogout, faShieldCheck as fadtShield,
  faKey as fadtKey, faBell as fadtBell, faMagnifyingGlass as fadtSearch,
  faUser as fadtUser, faPalette as fadtPalette, faLock as fadtLock,
  faMask as fadtMask, faPlus as fadtPlus, faCheck as fadtCheck,
  faClock as fadtClock, faXmark as fadtX, faGrid2 as fadtSpaces,
  faEllipsis as fadtEllipsis, faFaceSmile as fadtSmile,
  faFaceSmilePlus as fadtSmilePlus, faPaperPlane as fadtSend,
  faTrash as fadtTrash, faFileExport as fadtFileExport,
  faFileImport as fadtFileImport, faChevronDown as fadtChevronDown,
  faChevronRight as fadtChevronRight, faChevronUp as fadtChevronUp,
  faCamera as fadtCamera, faImage as fadtImage, faGlobe as fadtGlobe,
  faDesktop as fadtDesktop, faBars as fadtBars, faEye as fadtEye,
  faThumbsUp as fadtThumbsUp, faTriangleExclamation as fadtWarning,
  faCircleCheck as fadtSuccess, faCircleXmark as fadtError,
  faBadgeCheck as fadtBadge, faFileArrowDown as fadtFileDown,
  faFileArrowUp as fadtFileUp, faArrowLeft as fadtArrowLeft,
  faCircle as fadtCircle, faPen as fadtPen,
} from '@awesome.me/kit-888aad49e1/icons/duotone/thin';

// ---------------------------------------------------------------------------
// Sharp DuoTone
// ---------------------------------------------------------------------------

import {
  faHouse as fasdsHouse, faMessage as fasdsMessage, faReply as fasdsReply, faUsers as fasdsUsers,
  faGear as fasdsGear, faCircleInfo as fasdsCircleInfo, faDownload as fasdsDownload,
  faRightFromBracket as fasdsLogout, faShieldCheck as fasdsShield,
  faKey as fasdsKey, faBell as fasdsBell, faMagnifyingGlass as fasdsSearch,
  faUser as fasdsUser, faPalette as fasdsPalette, faLock as fasdsLock,
  faMask as fasdsMask, faPlus as fasdsPlus, faCheck as fasdsCheck,
  faClock as fasdsClock, faXmark as fasdsX, faGrid2 as fasdsSpaces,
  faEllipsis as fasdsEllipsis, faFaceSmile as fasdsSmile,
  faFaceSmilePlus as fasdsSmilePlus, faPaperPlane as fasdsSend,
  faTrash as fasdsTrash, faFileExport as fasdsFileExport,
  faFileImport as fasdsFileImport, faChevronDown as fasdsChevronDown,
  faChevronRight as fasdsChevronRight, faChevronUp as fasdsChevronUp,
  faCamera as fasdsCamera, faImage as fasdsImage, faGlobe as fasdsGlobe,
  faDesktop as fasdsDesktop, faBars as fasdsBars, faEye as fasdsEye,
  faThumbsUp as fasdsThumbsUp, faTriangleExclamation as fasdsWarning,
  faCircleCheck as fasdsSuccess, faCircleXmark as fasdsError,
  faBadgeCheck as fasdsBadge, faFileArrowDown as fasdsFileDown,
  faFileArrowUp as fasdsFileUp, faArrowLeft as fasdsArrowLeft,
  faCircle as fasdsCircle, faPen as fasdsPen,
} from '@awesome.me/kit-888aad49e1/icons/sharp-duotone/solid';

import {
  faHouse as fasdrHouse, faMessage as fasdrMessage, faReply as fasdrReply, faUsers as fasdrUsers,
  faGear as fasdrGear, faCircleInfo as fasdrCircleInfo, faDownload as fasdrDownload,
  faRightFromBracket as fasdrLogout, faShieldCheck as fasdrShield,
  faKey as fasdrKey, faBell as fasdrBell, faMagnifyingGlass as fasdrSearch,
  faUser as fasdrUser, faPalette as fasdrPalette, faLock as fasdrLock,
  faMask as fasdrMask, faPlus as fasdrPlus, faCheck as fasdrCheck,
  faClock as fasdrClock, faXmark as fasdrX, faGrid2 as fasdrSpaces,
  faEllipsis as fasdrEllipsis, faFaceSmile as fasdrSmile,
  faFaceSmilePlus as fasdrSmilePlus, faPaperPlane as fasdrSend,
  faTrash as fasdrTrash, faFileExport as fasdrFileExport,
  faFileImport as fasdrFileImport, faChevronDown as fasdrChevronDown,
  faChevronRight as fasdrChevronRight, faChevronUp as fasdrChevronUp,
  faCamera as fasdrCamera, faImage as fasdrImage, faGlobe as fasdrGlobe,
  faDesktop as fasdrDesktop, faBars as fasdrBars, faEye as fasdrEye,
  faThumbsUp as fasdrThumbsUp, faTriangleExclamation as fasdrWarning,
  faCircleCheck as fasdrSuccess, faCircleXmark as fasdrError,
  faBadgeCheck as fasdrBadge, faFileArrowDown as fasdrFileDown,
  faFileArrowUp as fasdrFileUp, faArrowLeft as fasdrArrowLeft,
  faCircle as fasdrCircle, faPen as fasdrPen,
} from '@awesome.me/kit-888aad49e1/icons/sharp-duotone/regular';

import {
  faHouse as fasdlHouse, faMessage as fasdlMessage, faReply as fasdlReply, faUsers as fasdlUsers,
  faGear as fasdlGear, faCircleInfo as fasdlCircleInfo, faDownload as fasdlDownload,
  faRightFromBracket as fasdlLogout, faShieldCheck as fasdlShield,
  faKey as fasdlKey, faBell as fasdlBell, faMagnifyingGlass as fasdlSearch,
  faUser as fasdlUser, faPalette as fasdlPalette, faLock as fasdlLock,
  faMask as fasdlMask, faPlus as fasdlPlus, faCheck as fasdlCheck,
  faClock as fasdlClock, faXmark as fasdlX, faGrid2 as fasdlSpaces,
  faEllipsis as fasdlEllipsis, faFaceSmile as fasdlSmile,
  faFaceSmilePlus as fasdlSmilePlus, faPaperPlane as fasdlSend,
  faTrash as fasdlTrash, faFileExport as fasdlFileExport,
  faFileImport as fasdlFileImport, faChevronDown as fasdlChevronDown,
  faChevronRight as fasdlChevronRight, faChevronUp as fasdlChevronUp,
  faCamera as fasdlCamera, faImage as fasdlImage, faGlobe as fasdlGlobe,
  faDesktop as fasdlDesktop, faBars as fasdlBars, faEye as fasdlEye,
  faThumbsUp as fasdlThumbsUp, faTriangleExclamation as fasdlWarning,
  faCircleCheck as fasdlSuccess, faCircleXmark as fasdlError,
  faBadgeCheck as fasdlBadge, faFileArrowDown as fasdlFileDown,
  faFileArrowUp as fasdlFileUp, faArrowLeft as fasdlArrowLeft,
  faCircle as fasdlCircle, faPen as fasdlPen,
} from '@awesome.me/kit-888aad49e1/icons/sharp-duotone/light';

import {
  faHouse as fasdtHouse, faMessage as fasdtMessage, faReply as fasdtReply, faUsers as fasdtUsers,
  faGear as fasdtGear, faCircleInfo as fasdtCircleInfo, faDownload as fasdtDownload,
  faRightFromBracket as fasdtLogout, faShieldCheck as fasdtShield,
  faKey as fasdtKey, faBell as fasdtBell, faMagnifyingGlass as fasdtSearch,
  faUser as fasdtUser, faPalette as fasdtPalette, faLock as fasdtLock,
  faMask as fasdtMask, faPlus as fasdtPlus, faCheck as fasdtCheck,
  faClock as fasdtClock, faXmark as fasdtX, faGrid2 as fasdtSpaces,
  faEllipsis as fasdtEllipsis, faFaceSmile as fasdtSmile,
  faFaceSmilePlus as fasdtSmilePlus, faPaperPlane as fasdtSend,
  faTrash as fasdtTrash, faFileExport as fasdtFileExport,
  faFileImport as fasdtFileImport, faChevronDown as fasdtChevronDown,
  faChevronRight as fasdtChevronRight, faChevronUp as fasdtChevronUp,
  faCamera as fasdtCamera, faImage as fasdtImage, faGlobe as fasdtGlobe,
  faDesktop as fasdtDesktop, faBars as fasdtBars, faEye as fasdtEye,
  faThumbsUp as fasdtThumbsUp, faTriangleExclamation as fasdtWarning,
  faCircleCheck as fasdtSuccess, faCircleXmark as fasdtError,
  faBadgeCheck as fasdtBadge, faFileArrowDown as fasdtFileDown,
  faFileArrowUp as fasdtFileUp, faArrowLeft as fasdtArrowLeft,
  faCircle as fasdtCircle, faPen as fasdtPen,
} from '@awesome.me/kit-888aad49e1/icons/sharp-duotone/thin';

// ---------------------------------------------------------------------------
// Pro+ packs (partial icon sets -- missing icons fall back to Sharp Solid)
// ---------------------------------------------------------------------------

import {
  faHouse as facrHouse, faUsers as facrUsers, faGear as facrGear,
  faCircleInfo as facrCircleInfo, faKey as facrKey, faBell as facrBell,
  faMagnifyingGlass as facrSearch, faUser as facrUser, faPalette as facrPalette,
  faLock as facrLock, faPlus as facrPlus, faCheck as facrCheck,
  faClock as facrClock, faXmark as facrX, faFaceSmile as facrSmile,
  faPaperPlane as facrSend, faTrash as facrTrash, faCamera as facrCamera,
  faImage as facrImage, faGlobe as facrGlobe, faDesktop as facrDesktop,
  faBars as facrBars, faEye as facrEye, faThumbsUp as facrThumbsUp,
  faTriangleExclamation as facrWarning, faArrowLeft as facrArrowLeft,
  faCircle as facrCircle,
} from '@awesome.me/kit-888aad49e1/icons/chisel/regular';

import {
  faHouse as faesHouse, faUsers as faesUsers, faGear as faesGear,
  faCircleInfo as faesCircleInfo, faKey as faesKey, faBell as faesBell,
  faMagnifyingGlass as faesSearch, faUser as faesUser, faPalette as faesPalette,
  faLock as faesLock, faPlus as faesPlus, faCheck as faesCheck,
  faClock as faesClock, faXmark as faesX, faFaceSmile as faesSmile,
  faPaperPlane as faesSend, faTrash as faesTrash, faCamera as faesCamera,
  faImage as faesImage, faGlobe as faesGlobe, faDesktop as faesDesktop,
  faBars as faesBars, faEye as faesEye, faThumbsUp as faesThumbsUp,
  faTriangleExclamation as faesWarning, faArrowLeft as faesArrowLeft,
  faCircle as faesCircle,
} from '@awesome.me/kit-888aad49e1/icons/etch/solid';

import {
  faHouse as fagtHouse, faUsers as fagtUsers, faGear as fagtGear,
  faCircleInfo as fagtCircleInfo, faKey as fagtKey, faBell as fagtBell,
  faMagnifyingGlass as fagtSearch, faUser as fagtUser, faPalette as fagtPalette,
  faLock as fagtLock, faPlus as fagtPlus, faCheck as fagtCheck,
  faClock as fagtClock, faXmark as fagtX, faFaceSmile as fagtSmile,
  faPaperPlane as fagtSend, faTrash as fagtTrash, faCamera as fagtCamera,
  faImage as fagtImage, faGlobe as fagtGlobe, faDesktop as fagtDesktop,
  faBars as fagtBars, faEye as fagtEye, faThumbsUp as fagtThumbsUp,
  faTriangleExclamation as fagtWarning, faArrowLeft as fagtArrowLeft,
  faCircle as fagtCircle,
} from '@awesome.me/kit-888aad49e1/icons/graphite/thin';

import {
  faHouse as fajrHouse, faUsers as fajrUsers, faGear as fajrGear,
  faCircleInfo as fajrCircleInfo, faKey as fajrKey, faBell as fajrBell,
  faMagnifyingGlass as fajrSearch, faUser as fajrUser, faPalette as fajrPalette,
  faLock as fajrLock, faPlus as fajrPlus, faCheck as fajrCheck,
  faClock as fajrClock, faXmark as fajrX, faEllipsis as fajrEllipsis,
  faFaceSmile as fajrSmile, faPaperPlane as fajrSend, faTrash as fajrTrash,
  faCamera as fajrCamera, faImage as fajrImage, faGlobe as fajrGlobe,
  faDesktop as fajrDesktop, faBars as fajrBars, faEye as fajrEye,
  faThumbsUp as fajrThumbsUp, faTriangleExclamation as fajrWarning,
  faCircleCheck as fajrSuccess, faCircleXmark as fajrError,
  faArrowLeft as fajrArrowLeft, faCircle as fajrCircle,
} from '@awesome.me/kit-888aad49e1/icons/jelly/regular';

import {
  faHouse as fausbHouse, faUsers as fausbUsers, faGear as fausbGear,
  faCircleInfo as fausbCircleInfo, faShieldCheck as fausbShield,
  faKey as fausbKey, faBell as fausbBell, faMagnifyingGlass as fausbSearch,
  faUser as fausbUser, faPalette as fausbPalette, faLock as fausbLock,
  faPlus as fausbPlus, faCheck as fausbCheck, faClock as fausbClock,
  faXmark as fausbX, faGrid2 as fausbSpaces, faEllipsis as fausbEllipsis,
  faFaceSmile as fausbSmile, faPaperPlane as fausbSend,
  faTrash as fausbTrash, faCamera as fausbCamera, faImage as fausbImage,
  faGlobe as fausbGlobe, faBars as fausbBars, faEye as fausbEye,
  faThumbsUp as fausbThumbsUp, faCircleCheck as fausbSuccess,
  faArrowLeft as fausbArrowLeft, faCircle as fausbCircle,
} from '@awesome.me/kit-888aad49e1/icons/utility/semibold';

import {
  faHouse as fawsbHouse, faUsers as fawsbUsers, faGear as fawsbGear,
  faCircleInfo as fawsbCircleInfo, faShieldCheck as fawsbShield,
  faKey as fawsbKey, faBell as fawsbBell, faMagnifyingGlass as fawsbSearch,
  faUser as fawsbUser, faPalette as fawsbPalette, faLock as fawsbLock,
  faPlus as fawsbPlus, faCheck as fawsbCheck, faClock as fawsbClock,
  faXmark as fawsbX, faEllipsis as fawsbEllipsis,
  faFaceSmile as fawsbSmile, faPaperPlane as fawsbSend,
  faTrash as fawsbTrash, faCamera as fawsbCamera, faImage as fawsbImage,
  faGlobe as fawsbGlobe, faBars as fawsbBars, faEye as fawsbEye,
  faThumbsUp as fawsbThumbsUp, faCircleCheck as fawsbSuccess,
  faArrowLeft as fawsbArrowLeft, faCircle as fawsbCircle,
} from '@awesome.me/kit-888aad49e1/icons/whiteboard/semibold';

// ---------------------------------------------------------------------------
// Register everything with the FA library
// ---------------------------------------------------------------------------

const allIcons: IconDefinition[] = [
  // Sharp
  sassHouse, sassMessage, sassReply, sassUsers, sassGear, sassCircleInfo, sassDownload,
  sassLogout, sassShield, sassKey, sassBell, sassSearch, sassUser, sassPalette,
  sassLock, sassMask, sassPlus, sassCheck, sassClock, sassX, sassSpaces,
  sassEllipsis, sassSmile, sassSmilePlus, sassSend, sassTrash, sassFileExport,
  sassFileImport, sassChevronDown, sassChevronRight, sassChevronUp, sassCamera,
  sassImage, sassGlobe, sassDesktop, sassBars, sassEye, sassThumbsUp,
  sassWarning, sassSuccess, sassError, sassBadge, sassFileDown, sassFileUp,
  sassArrowLeft, sassCircle, sassPen,

  sasrHouse, sasrMessage, sasrReply, sasrUsers, sasrGear, sasrCircleInfo, sasrDownload,
  sasrLogout, sasrShield, sasrKey, sasrBell, sasrSearch, sasrUser, sasrPalette,
  sasrLock, sasrMask, sasrPlus, sasrCheck, sasrClock, sasrX, sasrSpaces,
  sasrEllipsis, sasrSmile, sasrSmilePlus, sasrSend, sasrTrash, sasrFileExport,
  sasrFileImport, sasrChevronDown, sasrChevronRight, sasrChevronUp, sasrCamera,
  sasrImage, sasrGlobe, sasrDesktop, sasrBars, sasrEye, sasrThumbsUp,
  sasrWarning, sasrSuccess, sasrError, sasrBadge, sasrFileDown, sasrFileUp,
  sasrArrowLeft, sasrCircle, sasrPen,

  saslHouse, saslMessage, saslReply, saslUsers, saslGear, saslCircleInfo, saslDownload,
  saslLogout, saslShield, saslKey, saslBell, saslSearch, saslUser, saslPalette,
  saslLock, saslMask, saslPlus, saslCheck, saslClock, saslX, saslSpaces,
  saslEllipsis, saslSmile, saslSmilePlus, saslSend, saslTrash, saslFileExport,
  saslFileImport, saslChevronDown, saslChevronRight, saslChevronUp, saslCamera,
  saslImage, saslGlobe, saslDesktop, saslBars, saslEye, saslThumbsUp,
  saslWarning, saslSuccess, saslError, saslBadge, saslFileDown, saslFileUp,
  saslArrowLeft, saslCircle, saslPen,

  satHouse, satMessage, satReply, satUsers, satGear, satCircleInfo, satDownload,
  satLogout, satShield, satKey, satBell, satSearch, satUser, satPalette,
  satLock, satMask, satPlus, satCheck, satClock, satX, satSpaces,
  satEllipsis, satSmile, satSmilePlus, satSend, satTrash, satFileExport,
  satFileImport, satChevronDown, satChevronRight, satChevronUp, satCamera,
  satImage, satGlobe, satDesktop, satBars, satEye, satThumbsUp,
  satWarning, satSuccess, satError, satBadge, satFileDown, satFileUp,
  satArrowLeft, satCircle, satPen,

  // Classic
  fasHouse, fasMessage, fasReply, fasUsers, fasGear, fasCircleInfo, fasDownload,
  fasLogout, fasShield, fasKey, fasBell, fasSearch, fasUser, fasPalette,
  fasLock, fasMask, fasPlus, fasCheck, fasClock, fasX, fasSpaces,
  fasEllipsis, fasSmile, fasSmilePlus, fasSend, fasTrash, fasFileExport,
  fasFileImport, fasChevronDown, fasChevronRight, fasChevronUp, fasCamera,
  fasImage, fasGlobe, fasDesktop, fasBars, fasEye, fasThumbsUp,
  fasWarning, fasSuccess, fasError, fasBadge, fasFileDown, fasFileUp,
  fasArrowLeft, fasCircle, fasPen,

  farHouse, farMessage, farReply, farUsers, farGear, farCircleInfo, farDownload,
  farLogout, farShield, farKey, farBell, farSearch, farUser, farPalette,
  farLock, farMask, farPlus, farCheck, farClock, farX, farSpaces,
  farEllipsis, farSmile, farSmilePlus, farSend, farTrash, farFileExport,
  farFileImport, farChevronDown, farChevronRight, farChevronUp, farCamera,
  farImage, farGlobe, farDesktop, farBars, farEye, farThumbsUp,
  farWarning, farSuccess, farError, farBadge, farFileDown, farFileUp,
  farArrowLeft, farCircle, farPen,

  falHouse, falMessage, falReply, falUsers, falGear, falCircleInfo, falDownload,
  falLogout, falShield, falKey, falBell, falSearch, falUser, falPalette,
  falLock, falMask, falPlus, falCheck, falClock, falX, falSpaces,
  falEllipsis, falSmile, falSmilePlus, falSend, falTrash, falFileExport,
  falFileImport, falChevronDown, falChevronRight, falChevronUp, falCamera,
  falImage, falGlobe, falDesktop, falBars, falEye, falThumbsUp,
  falWarning, falSuccess, falError, falBadge, falFileDown, falFileUp,
  falArrowLeft, falCircle, falPen,

  fatHouse, fatMessage, fatReply, fatUsers, fatGear, fatCircleInfo, fatDownload,
  fatLogout, fatShield, fatKey, fatBell, fatSearch, fatUser, fatPalette,
  fatLock, fatMask, fatPlus, fatCheck, fatClock, fatX, fatSpaces,
  fatEllipsis, fatSmile, fatSmilePlus, fatSend, fatTrash, fatFileExport,
  fatFileImport, fatChevronDown, fatChevronRight, fatChevronUp, fatCamera,
  fatImage, fatGlobe, fatDesktop, fatBars, fatEye, fatThumbsUp,
  fatWarning, fatSuccess, fatError, fatBadge, fatFileDown, fatFileUp,
  fatArrowLeft, fatCircle, fatPen,

  // DuoTone
  fadHouse, fadMessage, fadReply, fadUsers, fadGear, fadCircleInfo, fadDownload,
  fadLogout, fadShield, fadKey, fadBell, fadSearch, fadUser, fadPalette,
  fadLock, fadMask, fadPlus, fadCheck, fadClock, fadX, fadSpaces,
  fadEllipsis, fadSmile, fadSmilePlus, fadSend, fadTrash, fadFileExport,
  fadFileImport, fadChevronDown, fadChevronRight, fadChevronUp, fadCamera,
  fadImage, fadGlobe, fadDesktop, fadBars, fadEye, fadThumbsUp,
  fadWarning, fadSuccess, fadError, fadBadge, fadFileDown, fadFileUp,
  fadArrowLeft, fadCircle, fadPen,

  fadrHouse, fadrMessage, fadrReply, fadrUsers, fadrGear, fadrCircleInfo, fadrDownload,
  fadrLogout, fadrShield, fadrKey, fadrBell, fadrSearch, fadrUser, fadrPalette,
  fadrLock, fadrMask, fadrPlus, fadrCheck, fadrClock, fadrX, fadrSpaces,
  fadrEllipsis, fadrSmile, fadrSmilePlus, fadrSend, fadrTrash, fadrFileExport,
  fadrFileImport, fadrChevronDown, fadrChevronRight, fadrChevronUp, fadrCamera,
  fadrImage, fadrGlobe, fadrDesktop, fadrBars, fadrEye, fadrThumbsUp,
  fadrWarning, fadrSuccess, fadrError, fadrBadge, fadrFileDown, fadrFileUp,
  fadrArrowLeft, fadrCircle, fadrPen,

  fadlHouse, fadlMessage, fadlReply, fadlUsers, fadlGear, fadlCircleInfo, fadlDownload,
  fadlLogout, fadlShield, fadlKey, fadlBell, fadlSearch, fadlUser, fadlPalette,
  fadlLock, fadlMask, fadlPlus, fadlCheck, fadlClock, fadlX, fadlSpaces,
  fadlEllipsis, fadlSmile, fadlSmilePlus, fadlSend, fadlTrash, fadlFileExport,
  fadlFileImport, fadlChevronDown, fadlChevronRight, fadlChevronUp, fadlCamera,
  fadlImage, fadlGlobe, fadlDesktop, fadlBars, fadlEye, fadlThumbsUp,
  fadlWarning, fadlSuccess, fadlError, fadlBadge, fadlFileDown, fadlFileUp,
  fadlArrowLeft, fadlCircle, fadlPen,

  fadtHouse, fadtMessage, fadtReply, fadtUsers, fadtGear, fadtCircleInfo, fadtDownload,
  fadtLogout, fadtShield, fadtKey, fadtBell, fadtSearch, fadtUser, fadtPalette,
  fadtLock, fadtMask, fadtPlus, fadtCheck, fadtClock, fadtX, fadtSpaces,
  fadtEllipsis, fadtSmile, fadtSmilePlus, fadtSend, fadtTrash, fadtFileExport,
  fadtFileImport, fadtChevronDown, fadtChevronRight, fadtChevronUp, fadtCamera,
  fadtImage, fadtGlobe, fadtDesktop, fadtBars, fadtEye, fadtThumbsUp,
  fadtWarning, fadtSuccess, fadtError, fadtBadge, fadtFileDown, fadtFileUp,
  fadtArrowLeft, fadtCircle, fadtPen,

  // Sharp DuoTone
  fasdsHouse, fasdsMessage, fasdsReply, fasdsUsers, fasdsGear, fasdsCircleInfo, fasdsDownload,
  fasdsLogout, fasdsShield, fasdsKey, fasdsBell, fasdsSearch, fasdsUser, fasdsPalette,
  fasdsLock, fasdsMask, fasdsPlus, fasdsCheck, fasdsClock, fasdsX, fasdsSpaces,
  fasdsEllipsis, fasdsSmile, fasdsSmilePlus, fasdsSend, fasdsTrash, fasdsFileExport,
  fasdsFileImport, fasdsChevronDown, fasdsChevronRight, fasdsChevronUp, fasdsCamera,
  fasdsImage, fasdsGlobe, fasdsDesktop, fasdsBars, fasdsEye, fasdsThumbsUp,
  fasdsWarning, fasdsSuccess, fasdsError, fasdsBadge, fasdsFileDown, fasdsFileUp,
  fasdsArrowLeft, fasdsCircle, fasdsPen,

  fasdrHouse, fasdrMessage, fasdrReply, fasdrUsers, fasdrGear, fasdrCircleInfo, fasdrDownload,
  fasdrLogout, fasdrShield, fasdrKey, fasdrBell, fasdrSearch, fasdrUser, fasdrPalette,
  fasdrLock, fasdrMask, fasdrPlus, fasdrCheck, fasdrClock, fasdrX, fasdrSpaces,
  fasdrEllipsis, fasdrSmile, fasdrSmilePlus, fasdrSend, fasdrTrash, fasdrFileExport,
  fasdrFileImport, fasdrChevronDown, fasdrChevronRight, fasdrChevronUp, fasdrCamera,
  fasdrImage, fasdrGlobe, fasdrDesktop, fasdrBars, fasdrEye, fasdrThumbsUp,
  fasdrWarning, fasdrSuccess, fasdrError, fasdrBadge, fasdrFileDown, fasdrFileUp,
  fasdrArrowLeft, fasdrCircle, fasdrPen,

  fasdlHouse, fasdlMessage, fasdlReply, fasdlUsers, fasdlGear, fasdlCircleInfo, fasdlDownload,
  fasdlLogout, fasdlShield, fasdlKey, fasdlBell, fasdlSearch, fasdlUser, fasdlPalette,
  fasdlLock, fasdlMask, fasdlPlus, fasdlCheck, fasdlClock, fasdlX, fasdlSpaces,
  fasdlEllipsis, fasdlSmile, fasdlSmilePlus, fasdlSend, fasdlTrash, fasdlFileExport,
  fasdlFileImport, fasdlChevronDown, fasdlChevronRight, fasdlChevronUp, fasdlCamera,
  fasdlImage, fasdlGlobe, fasdlDesktop, fasdlBars, fasdlEye, fasdlThumbsUp,
  fasdlWarning, fasdlSuccess, fasdlError, fasdlBadge, fasdlFileDown, fasdlFileUp,
  fasdlArrowLeft, fasdlCircle, fasdlPen,

  fasdtHouse, fasdtMessage, fasdtReply, fasdtUsers, fasdtGear, fasdtCircleInfo, fasdtDownload,
  fasdtLogout, fasdtShield, fasdtKey, fasdtBell, fasdtSearch, fasdtUser, fasdtPalette,
  fasdtLock, fasdtMask, fasdtPlus, fasdtCheck, fasdtClock, fasdtX, fasdtSpaces,
  fasdtEllipsis, fasdtSmile, fasdtSmilePlus, fasdtSend, fasdtTrash, fasdtFileExport,
  fasdtFileImport, fasdtChevronDown, fasdtChevronRight, fasdtChevronUp, fasdtCamera,
  fasdtImage, fasdtGlobe, fasdtDesktop, fasdtBars, fasdtEye, fasdtThumbsUp,
  fasdtWarning, fasdtSuccess, fasdtError, fasdtBadge, fasdtFileDown, fasdtFileUp,
  fasdtArrowLeft, fasdtCircle, fasdtPen,

  // Pro+ packs
  facrHouse, facrUsers, facrGear, facrCircleInfo, facrKey, facrBell,
  facrSearch, facrUser, facrPalette, facrLock, facrPlus, facrCheck,
  facrClock, facrX, facrSmile, facrSend, facrTrash, facrCamera,
  facrImage, facrGlobe, facrDesktop, facrBars, facrEye, facrThumbsUp,
  facrWarning, facrArrowLeft, facrCircle,

  faesHouse, faesUsers, faesGear, faesCircleInfo, faesKey, faesBell,
  faesSearch, faesUser, faesPalette, faesLock, faesPlus, faesCheck,
  faesClock, faesX, faesSmile, faesSend, faesTrash, faesCamera,
  faesImage, faesGlobe, faesDesktop, faesBars, faesEye, faesThumbsUp,
  faesWarning, faesArrowLeft, faesCircle,

  fagtHouse, fagtUsers, fagtGear, fagtCircleInfo, fagtKey, fagtBell,
  fagtSearch, fagtUser, fagtPalette, fagtLock, fagtPlus, fagtCheck,
  fagtClock, fagtX, fagtSmile, fagtSend, fagtTrash, fagtCamera,
  fagtImage, fagtGlobe, fagtDesktop, fagtBars, fagtEye, fagtThumbsUp,
  fagtWarning, fagtArrowLeft, fagtCircle,

  fajrHouse, fajrUsers, fajrGear, fajrCircleInfo, fajrKey, fajrBell,
  fajrSearch, fajrUser, fajrPalette, fajrLock, fajrPlus, fajrCheck,
  fajrClock, fajrX, fajrEllipsis, fajrSmile, fajrSend, fajrTrash,
  fajrCamera, fajrImage, fajrGlobe, fajrDesktop, fajrBars, fajrEye,
  fajrThumbsUp, fajrWarning, fajrSuccess, fajrError, fajrArrowLeft,
  fajrCircle,

  fausbHouse, fausbUsers, fausbGear, fausbCircleInfo, fausbShield,
  fausbKey, fausbBell, fausbSearch, fausbUser, fausbPalette, fausbLock,
  fausbPlus, fausbCheck, fausbClock, fausbX, fausbSpaces, fausbEllipsis,
  fausbSmile, fausbSend, fausbTrash, fausbCamera, fausbImage, fausbGlobe,
  fausbBars, fausbEye, fausbThumbsUp, fausbSuccess,
  fausbArrowLeft, fausbCircle,

  fawsbHouse, fawsbUsers, fawsbGear, fawsbCircleInfo, fawsbShield,
  fawsbKey, fawsbBell, fawsbSearch, fawsbUser, fawsbPalette, fawsbLock,
  fawsbPlus, fawsbCheck, fawsbClock, fawsbX, fawsbEllipsis,
  fawsbSmile, fawsbSend, fawsbTrash, fawsbCamera, fawsbImage, fawsbGlobe,
  fawsbBars, fawsbEye, fawsbThumbsUp, fawsbSuccess,
  fawsbArrowLeft, fawsbCircle,
];

library.add(...allIcons);

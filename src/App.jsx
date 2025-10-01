import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import logo from './assets/logoo.png'; // ajustá el nombre/ruta si usaste otro


// PDF.js is used to count pages (loaded via script tag in index.html)
/* global pdfjsLib */ 
/* prueba */
const firebaseConfig = {
    apiKey: "AIzaSyDniek73av9oHTVIdFXqZrxOa-ONiGh0lo",
    authDomain: "todocolor-1c93b.firebaseapp.com",
    projectId: "todocolor-1c93b",
    storageBucket: "todocolor-1c93b.firebasestorage.app",
    messagingSenderId: "685905207621",
    appId: "1:685905207621:web:3784345d1788a791111e2c",
    measurementId: "G-VGWFTPZQY3"
};

// Fixed appId for Firestore pathing
const appId = 'fotocopiadora-prod';

// ID estable para tus datos (no depende del UID ni del proyecto)
const TENANT_ID = 'fotocopiadora-prod'; // podés usar el mismo valor que appId

// Replace after first login with your UID to unlock owner mode
// UID principal del dueño (donde vive el catálogo)
const OWNER_USER_ID = 'LduwDi2N0ifsdj44sL40T774JR93';

// Lista de UIDs que pueden entrar en modo dueño
const OWNER_UIDS = [
  OWNER_USER_ID, 'LduwDi2N0ifsdj44sL40T774JR93'
  // Si querés más dueños, agregalos acá como strings:
  // 'otroUID', 
];
;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// —— Helpers de precio llamativo ——
const formatARS = (n) => {
  if (typeof n !== 'number' || isNaN(n)) return '$0';
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
};

const PricePill = ({ label, price, variant = 'cash', sublabel }) => {
  const isCash = variant === 'cash';
  const wrap = isCash
    ? 'from-green-50 to-green-100 border-green-200 text-green-800'
    : 'from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-800';
  const icon = isCash ? '💵' : '🏦';

  return (
    <div
  className={`relative w-full min-w-0 border rounded-xl p-3 ${!isCash ? 'pr-4 sm:pr-6' : ''} bg-gradient-to-br ${wrap} shadow-sm`}
>


      

      {/* Encabezado: icono + texto perfectamente alineados */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1 h-5">
          <span className="inline-flex items-center justify-center w-4 h-4 leading-none translate-y-[0.5px] select-none">
            {icon}
          </span>
          <span
  className="text-[10px] sm:text-[11px] font-medium uppercase leading-none opacity-80 whitespace-nowrap tracking-normal sm:tracking-wide"
  style={{ fontFamily: 'Inter, sans-serif' }}
>
  {label}
</span>

        </div>
      </div>

      {/* Precio: misma separación arriba para que alinee con la otra tarjeta */}
      <div className="mt-2">
        <div className="text-lg sm:text-2xl font-extrabold leading-tight">
          {formatARS(price)}
        </div>
        {sublabel && (
          <div className="text-[11px] mt-1 opacity-80 leading-snug">{sublabel}</div>
        )}
      </div>
    </div>
  );
};


const App = () => {
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [currentPage, setCurrentPage] = useState('calculator');
  const [message, setMessage] = useState('');

  // Calculator
  const [numPages, setNumPages] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [includeBinding, setIncludeBinding] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('transferencia');
  const [calculatedPrice, setCalculatedPrice] = useState(0);

  // Catalog
  const [catalogItems, setCatalogItems] = useState([]);
  const [newCatalogItemName, setNewCatalogItemName] = useState('');
  const [newCatalogItemPages, setNewCatalogItemPages] = useState('');
  const [newCatalogItemImage, setNewCatalogItemImage] = useState(null);
  const [newCatalogItemImagePreview, setNewCatalogItemImagePreview] = useState(null);
  // 🔎 Búsqueda en catálogo
  const [catalogSearch, setCatalogSearch] = useState('');

  // --- Carpetas del catálogo ---
const ROOT = null; // representa la raíz
const [folders, setFolders] = useState([]);
const [currentFolderId, setCurrentFolderId] = useState(ROOT);
const [newFolderName, setNewFolderName] = useState('');

// Breadcrumb calculado
const breadcrumbs = useMemo(() => {
  const map = new Map(folders.map(f => [f.id, f]));
  const trail = [];
  let id = currentFolderId;
  while (id) {
    const f = map.get(id);
    if (!f) break;
    trail.unshift({ id: f.id, name: f.name, parentId: f.parentId ?? null });
    id = f.parentId ?? null;
  }
  return [{ id: ROOT, name: 'Catálogo' }, ...trail];
}, [folders, currentFolderId]);

// Normaliza texto para que la búsqueda ignore mayúsculas/acentos
  const norm = (s) =>
  (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Lista filtrada según la búsqueda
  const filteredCatalogItems = React.useMemo(() => {
  const q = norm(catalogSearch.trim());
  if (!q) return catalogItems;
  return catalogItems.filter(it =>
    norm(it.name).includes(q) ||
    String(it.pageCount ?? '').includes(catalogSearch.trim())
  );
}, [catalogItems, catalogSearch]);


  // Cart
  const [cartItems, setCartItems] = useState([]);
  const [sendToInterior, setSendToInterior] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState(
  localStorage.getItem('customerPhone') || ''
);

useEffect(() => {
  localStorage.setItem('customerPhone', customerPhone);
}, [customerPhone]);

const isValidPhone = (p) => /^\d{10,15}$/.test(p);


  // NUEVO: método de pago elegido a nivel carrito
const [cartPaymentMethod, setCartPaymentMethod] = useState('transferencia');

  // Settings
  const [settings, setSettings] = useState({
  pricePerPageUnder100: 10,
  pricePerPageOver100: 8,
  bindingPriceUnder200: 100,
  bindingPriceOver200: 150,
  maxPagesPerBinding: 600,
  deliveryTimeMessage: 'Los pedidos suelen demorar entre 24 y 48 horas hábiles.',
  });

  // Auth (dentro del componente)
useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (user) => {
    if (user) {
      setUserId(user.uid);
      setIsOwner(OWNER_UIDS.includes(user.uid)); // 👈 usar includes
      setIsAuthReady(true);
    } else {
      try { 
        await signInAnonymously(auth); 
      } catch (e) { 
        console.error(e); 
        setIsAuthReady(true); 
      }
    }
  });
  return () => unsub();
}, []);


  // Fetch settings (TODOS leen el doc del DUEÑO)
useEffect(() => {
  if (!isAuthReady) return;

  const settingsDocRef = doc(
    db, 'tenants', TENANT_ID, 'settings', 'general'
  );

  const unsub = onSnapshot(
    settingsDocRef,
    (snap) => {
      if (snap.exists()) {
        setSettings((prev) => ({ ...prev, ...snap.data() }));
      } else if (isOwner) {
        // Solo el dueño crea los defaults si aún no existe
        setDoc(settingsDocRef, settings).catch((e) =>
          console.error("Default settings error:", e)
        );
      } else {
        // Visitante sin doc: NO crear nada acá
        // (se queda con los defaults locales hasta que el dueño guarde)
      }
    },
    (err) => {
      console.error(err);
      setMessage(`Error al cargar la configuración: ${err.message}`);
    }
  );

  return () => unsub();
}, [isAuthReady, isOwner]);


  // Fetch catalog (todos leen el catálogo del dueño)
useEffect(() => {
  if (!isAuthReady) return;
  const colRef = collection(db,'tenants',TENANT_ID,'catalog_items');
  const unsub = onSnapshot(colRef, (snap) => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setCatalogItems(items);
  }, (err) => setMessage(`Error al cargar el catálogo: ${err.message}`));
  return () => unsub();
}, [isAuthReady]);

// Fetch folders (todos leen las carpetas del dueño)
useEffect(() => {
  if (!isAuthReady) return;
  const colRef = collection(db,'tenants',TENANT_ID,'catalog_folders');
  const unsub = onSnapshot(colRef, (snap) => {
    const fs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setFolders(fs);
  }, (err) => setMessage(`Error al cargar carpetas: ${err.message}`));
  return () => unsub();
}, [isAuthReady]);

  // Price calculation
  const calculatePrice = useCallback((pages, includeBindingOption, paymentMethodOption, totalPagesInCart) => {
    if (!pages || pages <= 0) return 0;
    const pricePerPage = totalPagesInCart > 100 ? settings.pricePerPageOver100 : settings.pricePerPageUnder100;
    const base = pages * pricePerPage;
    let binding = 0;
    if (includeBindingOption) {
      const n = Math.ceil(pages / settings.maxPagesPerBinding);
      binding = pages > 200 ? n * settings.bindingPriceOver200 : n * settings.bindingPriceUnder200;
    }
    let finalP = base + binding;
    if (paymentMethodOption === 'efectivo') finalP *= (1 - settings.cashDiscountPercentage / 100);
    if (paymentMethodOption === 'transferencia') finalP *= (1 + settings.transferSurchargePercentage / 100);
    return parseFloat(finalP.toFixed(2));
  }, [settings]);

  // Recalculate cart when items/settings/payment method change
useEffect(() => {
  if (cartItems.length === 0) return;
  const totalPagesInCart = cartItems.reduce((s, it) => s + it.pageCount, 0);
  setCartItems(prev => prev.map(it => ({
    ...it,
    paymentMethod: cartPaymentMethod,
    price: calculatePrice(it.pageCount, it.binding, cartPaymentMethod, totalPagesInCart),
  })));
}, [cartItems.length, settings, cartPaymentMethod]);


  // Update calculator price
  useEffect(() => {
    if (numPages !== '') {
      const totalPagesInCart = cartItems.reduce((s, it) => s + it.pageCount, 0);
      const currentTotal = totalPagesInCart + (parseInt(numPages, 10) || 0);
      setCalculatedPrice(calculatePrice(parseInt(numPages, 10), includeBinding, paymentMethod, currentTotal));
    } else {
      setCalculatedPrice(0);
    }
  }, [numPages, includeBinding, paymentMethod, cartItems, calculatePrice]);

  // File upload
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      try {
        const _pdfjs = window.pdfjsLib || pdfjsLib;
        if (!_pdfjs) {
          setMessage("Error: PDF.js no está disponible. Refresca la página.");
          return;
        }
        _pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.mjs';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await _pdfjs.getDocument({ data: arrayBuffer }).promise;
        setNumPages(String(pdf.numPages));
      } catch (err) {
        console.error(err);
        setMessage("Error al leer el PDF. Asegúrate de que sea válido.");
        setNumPages('');
      }
    } else {
      setSelectedFile(null);
      setNumPages('');
    }
  };

  // WhatsApp single order
  const handleSendCalculatorOrder = () => {
    if (!numPages || numPages <= 0) {
      setMessage("Por favor, introduce un número válido de páginas.");
      return;
    }

    setMessage("Preparando tu pedido...");
    const ownerPhoneNumber = '5492213992396'; // Cambiar por el real
    let msg = `¡Hola! Me gustaría hacer un pedido de fotocopias.\n`;;
    msg += `Páginas: ${numPages}\n`;
    msg += `Archivo a imprimir: ${selectedFile ? selectedFile.name : 'No se subió archivo'}\n`;
    msg += `Anillado: ${includeBinding ? 'Sí' : 'No'}\n`;
    msg += `Método de pago para el cálculo: ${paymentMethod}\n`;
    msg += `Precio estimado: $${calculatedPrice.toFixed(2)}\n`;
    msg += `\n*Nota: Por favor, adjunta el archivo por este medio.*`;
    const url = `https://wa.me/${5492213992396}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    setMessage("Pedido enviado a WhatsApp. Adjuntá el archivo manualmente.");
  };

  // Add catalog item to cart
  const handleAddToCart = (item) => {
    const totalPagesInCart = cartItems.reduce((s, it) => s + it.pageCount, 0);
    const price = calculatePrice(item.pageCount, true, cartPaymentMethod, totalPagesInCart + item.pageCount);
    setCartItems((prev) => [...prev, { ...item, type: 'catalog', price, paymentMethod: cartPaymentMethod, binding: true }]);
    setMessage(`${item.name} añadido al carrito.`);
  };

  // Add calculator item
  const handleAddCalculatorToCart = () => {
  if (!numPages || numPages <= 0) {
    setMessage("Por favor, introduce un número válido de páginas.");
    return;
  }
  const totalPagesInCart = cartItems.reduce((s, it) => s + it.pageCount, 0);
  const pages = parseInt(numPages, 10);

  // usa el método del carrito
  const price = calculatePrice(pages, includeBinding, cartPaymentMethod, totalPagesInCart + pages);

  setCartItems(prev => [
    ...prev,
    {
      type: 'calculator',
      name: `Fotocopias (${pages} páginas${includeBinding ? ', anillado' : ''})`,
      pageCount: pages,
      binding: includeBinding,
      paymentMethod: cartPaymentMethod,   // <- acá va
      price                                // <- y el precio ya calculado
    }
  ]);

  setMessage(`Item de calculadora (${pages} páginas) añadido al carrito.`);
  setNumPages('');
  setCalculatedPrice(0);
  setIncludeBinding(false);
};


  // Remove from cart
  const handleRemoveFromCart = (idx) => {
    setCartItems((prev) => prev.filter((_, i) => i !== idx));
    setMessage("Artículo eliminado del carrito.");
  };

  // Finalize purchase
  const handleFinalizePurchase = () => {
    if (cartItems.length === 0) { setMessage("Tu carrito está vacío."); return; }
    if (!customerName.trim()) { setMessage("Por favor, ingresa tu nombre para continuar."); return; }
  if (!isValidPhone(customerPhone)) {
  setMessage('Ingresá tu WhatsApp en formato internacional, solo dígitos (ej.: 54911...).');
  return;
}

    const ownerPhoneNumber = '542213992396'; // Cambiar por el real
    let total = 0;
    let totalPages = 0;
    let msg = `¡Hola! Me gustaría finalizar mi compra de Todo Color.\n`;
    msg += `Nombre del Cliente: ${customerName.trim()}\n\n`;
    msg += `WhatsApp del Cliente: ${customerPhone}\n\n`;
    msg += `Método de pago elegido: ${cartPaymentMethod}\n\n`;
    msg += `Detalle del pedido:\n`;
    cartItems.forEach((it) => {
      total += it.price;
      totalPages += it.pageCount;
      if (it.type === 'catalog') {
        msg += `- ${it.name} (${it.pageCount} páginas): $${it.price.toFixed(2)}\n`;
      } else {
        msg += `Impresiones (${it.pageCount} páginas${it.binding ? ', anillado' : ''}): $${it.price.toFixed(2)}\n`;
        if (it.file && it.file !== 'No file') {
          msg += `  (Archivo: ${it.file}. Por favor, envía este archivo aparte.)\n`;
        }
      }
    });
    const down = total * 0.20, rest = total * 0.80;
    msg += `\nSubtotal: $${total.toFixed(2)} (Total páginas: ${totalPages})\n`;
    msg += `------------------------------------\n`;
    msg += `Total de la compra: $${total.toFixed(2)}\n`;
    msg += `\n**Seña a abonar (20% por transferencia): $${down.toFixed(2)}**\n`;
    msg += `Restante a abonar (80%): $${rest.toFixed(2)}\n`;
    if (sendToInterior) {
      msg += `\n**¡Importante!** Elegiste "Envíos al interior por Andreani". Coordinamos por WhatsApp.\n`;
    }
    msg += `\n¡Gracias por tu compra!`;
    const url = `https://wa.me/${ownerPhoneNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    setMessage("Pedido finalizado y mensaje de WhatsApp generado.");
    setCartItems([]); setSendToInterior(false); setCustomerName('');
  };

  // Owner save settings
  const handleSaveSettings = async () => {
  if (!isOwner) {
    setMessage("Solo el dueño puede guardar la configuración.");
    return;
  }
  try {
    const ref = doc(
      db, 'tenants', TENANT_ID, 'settings', 'general'
    );
    await setDoc(ref, {
      pricePerPageUnder100: parseFloat(settings.pricePerPageUnder100),
      pricePerPageOver100: parseFloat(settings.pricePerPageOver100),
      bindingPriceUnder200: parseFloat(settings.bindingPriceUnder200),
      bindingPriceOver200: parseFloat(settings.bindingPriceOver200),
      maxPagesPerBinding: parseInt(settings.maxPagesPerBinding, 10),
      cashDiscountPercentage: parseFloat(settings.cashDiscountPercentage),
      transferSurchargePercentage: parseFloat(settings.transferSurchargePercentage),
      deliveryTimeMessage: settings.deliveryTimeMessage,
    }, { merge: true });
    setMessage("Configuración guardada exitosamente.");
  } catch (e) {
    console.error(e);
    setMessage(`Error al guardar la configuración: ${e.message}`);
  }
};


const handleNewCatalogImageChange = (e) => {
  const file = e.target.files?.[0] || null;
  setNewCatalogItemImage(file);
  setNewCatalogItemImagePreview(file ? URL.createObjectURL(file) : null);
};

const handleAddFolder = async () => {
  if (!isOwner) { setMessage("Solo el dueño puede crear carpetas."); return; }
  const name = newFolderName.trim();
  if (!name) { setMessage("Poné un nombre para la carpeta."); return; }
  try {
    const colRef = collection(db,'tenants',TENANT_ID,'catalog_folders');
    await addDoc(colRef, { name, parentId: currentFolderId ?? null });
    setNewFolderName('');
    setMessage("Carpeta creada.");
  } catch (e) {
    console.error(e);
    setMessage(`Error al crear carpeta: ${e.message}`);
  }
};

const handleDeleteFolder = async (folderId) => {
  if (!isOwner) { setMessage("Solo el dueño puede eliminar carpetas."); return; }
  const hasSubfolders = folders.some(f => (f.parentId ?? null) === folderId);
  const hasItems = catalogItems.some(it => (it.folderId ?? null) === folderId);
  if (hasSubfolders || hasItems) { setMessage("No podés borrar una carpeta que contiene subcarpetas o artículos."); return; }

  try {
    const ref_ = doc(db, 'tenants', TENANT_ID, 'catalog_folders', folderId);
    await deleteDoc(ref_);
    if (currentFolderId === folderId) {
      const parent = folders.find(f => f.id === folderId)?.parentId ?? null;
      setCurrentFolderId(parent ?? null);
    }
    setMessage("Carpeta eliminada.");
  } catch (e) {
    console.error(e);
    setMessage(`Error al eliminar carpeta: ${e.message}`);
  }
};

  const handleAddCatalogItem = async () => {
  if (!isOwner) {
    setMessage("Solo el dueño puede agregar artículos al catálogo.");
    return;
  }
  if (!newCatalogItemName || !newCatalogItemPages || parseInt(newCatalogItemPages, 10) <= 0) {
    setMessage("Por favor, introduce un nombre y un número de páginas válido.");
    return;
  }
  try {
    const colRef = collection(
      db,'tenants',TENANT_ID,'catalog_items'
    );

    // 1) Creamos el doc con datos básicos y (opcional) un imageUrl vacío
    const docRef = await addDoc(colRef, {
      name: newCatalogItemName,
      pageCount: parseInt(newCatalogItemPages, 10),
      imageUrl: '', // lo completamos si hay foto
      folderId: currentFolderId ?? null
    });

    // 2) Si el dueño seleccionó imagen, la subimos a Storage y guardamos el URL
    if (newCatalogItemImage) {
      const imageRef = ref(storage, `catalog/${docRef.id}/${newCatalogItemImage.name}`);
      await uploadBytes(imageRef, newCatalogItemImage);
      const url = await getDownloadURL(imageRef);
      await setDoc(docRef, { imageUrl: url }, { merge: true });
    }

    setNewCatalogItemName('');
    setNewCatalogItemPages('');
    setNewCatalogItemImage(null);
    setNewCatalogItemImagePreview(null);
    setMessage("Artículo del catálogo añadido exitosamente.");
  } catch (e) {
    console.error(e);
    setMessage(`Error al añadir artículo: ${e.message}`);
  }
};



  const handleDeleteCatalogItem = async (id) => {
  if (!isOwner) {
    setMessage("Solo el dueño puede eliminar artículos del catálogo.");
    return;
  }
  try {
    const ref = doc(
      db,'tenants',TENANT_ID,'catalog_items', id
    );
    await deleteDoc(ref);
    setMessage("Artículo del catálogo eliminado exitosamente.");
  } catch (e) {
    console.error(e);
    setMessage(`Error al eliminar artículo: ${e.message}`);
  }
};

  const handleUpdateCatalogItemImage = async (itemId, file) => {
  if (!isOwner || !file) return;
  try {
    const imageRef = ref(storage, `catalog/${itemId}/${file.name}`);
    await uploadBytes(imageRef, file);
    const url = await getDownloadURL(imageRef);
    const itemRef = doc(db,'tenants',TENANT_ID,'catalog_items', itemId);
    await setDoc(itemRef, { imageUrl: url }, { merge: true });
    setMessage('Foto actualizada.');
  } catch (e) {
    console.error(e);
    setMessage(`Error al actualizar la foto: ${e.message}`);
  }
};


  const renderCalculator = () => (
  <div className="p-4 sm:p-6 bg-white rounded-lg shadow-md w-full max-w-lg mx-auto">
    <h2
  className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800"
  style={{ fontFamily: 'Inter, sans-serif' }}
>
  Calculadora de Copias
</h2>


    <div className="mb-4">
      <label htmlFor="numPages" className="block text-gray-700 text-sm font-bold mb-2">Cantidad de Páginas:</label>
      <input
        type="number" id="numPages"
        className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
        value={numPages} onChange={(e) => setNumPages(e.target.value)} min="1"
        placeholder="Ingresa el número de páginas"
      />
    </div>

    <div className="mb-4">
      <label className="flex items-center text-gray-700 text-sm font-bold">
        <input type="checkbox" className="form-checkbox h-5 w-5 text-blue-600 rounded"
               checked={includeBinding} onChange={(e) => setIncludeBinding(e.target.checked)} />
        <span className="ml-2">Incluir Anillado (opcional)</span>
      </label>
    </div>

    <div className="mb-6">
      <label className="block text-gray-700 text-sm font-bold mb-2">Método de Pago:</label>
      <div className="flex space-x-4">
        <label className="inline-flex items-center">
          <input type="radio" className="form-radio h-4 w-4 text-blue-600" name="paymentMethod" value="efectivo"
                 checked={paymentMethod === 'efectivo'} onChange={() => setPaymentMethod('efectivo')} />
          <span className="ml-2 text-gray-700">Efectivo</span>
        </label>
        <label className="inline-flex items-center">
          <input type="radio" className="form-radio h-4 w-4 text-blue-600" name="paymentMethod" value="transferencia"
                 checked={paymentMethod === 'transferencia'} onChange={() => setPaymentMethod('transferencia')} />
          <span className="ml-2 text-gray-700">Transferencia</span>
        </label>
      </div>
    </div>

    <div className="text-lg sm:text-xl font-semibold text-gray-800 mb-6">
      Precio Calculado: <span className="text-blue-600">$ {calculatedPrice.toFixed(2)}</span>
    </div>
    
    <div className="mt-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs sm:text-sm">
  <strong>Nota:</strong> el PDF se envía mediante el chat de WhatsApp. Cuando se abra WhatsApp,
  adjuntá tu archivo en la conversación. No queda almacenado en la web.
</div>


    <button onClick={handleAddCalculatorToCart}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold px-4 py-3 rounded-lg w-full
             cursor-pointer transition-transform duration-100 transform-gpu
             active:translate-y-[2px] active:scale-[0.98] shadow-md active:shadow-sm"
  style={{ fontFamily: 'Inter, sans-serif', WebkitTapHighlightColor: 'transparent' }}
>
      Añadir al Carrito
    </button>
  </div>
);


  const renderCatalog = () => {
  // Carpetas hijas de la carpeta actual
  const childFolders = folders.filter(f => (f.parentId ?? null) === (currentFolderId ?? null));

  // Ítems en la carpeta actual (si NO hay búsqueda)
  const itemsInCurrentFolder = catalogItems.filter(it => ((it.folderId ?? null) === (currentFolderId ?? null)));

  // Si hay búsqueda, mostramos resultados globales; si no, los de la carpeta actual
  const itemsToShow = catalogSearch.trim() ? filteredCatalogItems : itemsInCurrentFolder;

  return (
    <div className="p-4 sm:p-6 bg-white rounded-lg shadow-md w-full max-w-lg mx-auto">
      <h2
  className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800"
  style={{ fontFamily: 'Inter, sans-serif' }}
>
  Catálogo de Artículos
</h2>


      {/* Breadcrumb */}
      <nav className="text-sm text-gray-600 mb-4 flex flex-wrap items-center gap-1">
        {breadcrumbs.map((b, idx) => (
          <span key={b.id ?? 'root'} className="flex items-center">
            {idx > 0 && <span className="mx-1">/</span>}
            <button
              onClick={() => setCurrentFolderId(b.id ?? null)}
              className={`hover:underline ${idx === breadcrumbs.length - 1 ? 'font-semibold text-gray-800' : 'text-blue-600'}`}
            >
              {b.name}
            </button>
          </span>
        ))}
      </nav>

      {/* Panel del dueño */}
      {isOwner && (
        <div className="mb-6 border-b pb-4 border-gray-200">
          <h3 className="text-lg sm:text-xl font-semibold mb-3 text-gray-700">Administrar (Dueño)</h3>

          {/* Crear carpeta */}
          <div className="mb-4 flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-gray-700 text-sm font-bold mb-2">Nueva carpeta en esta ubicación:</label>
              <input
                type="text"
                className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                placeholder="Ej.: Medicina"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Se creará dentro de: <span className="italic">
                  {breadcrumbs[breadcrumbs.length - 1]?.name}
                </span>
              </p>
            </div>
            <button
              onClick={handleAddFolder}
              className="bg-gray-800 hover:bg-gray-900 text-white font-bold py-2 px-4 rounded-lg"
            >
              Crear carpeta
            </button>
          </div>

          {/* Crear artículo */}
<div className="mt-4">
  <h4 className="text-base font-semibold text-gray-700 mb-2">Crear artículo</h4>

  <div className="mb-3">
    <label className="block text-gray-700 text-sm font-bold mb-1">Nombre del Artículo</label>
    <input
      type="text"
      className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
      value={newCatalogItemName}
      onChange={(e) => setNewCatalogItemName(e.target.value)}
      placeholder="Ej.: Anatomía I"
    />
  </div>

  <div className="mb-3">
    <label className="block text-gray-700 text-sm font-bold mb-1">Cantidad de Páginas</label>
    <input
      type="number"
      min="1"
      className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
      value={newCatalogItemPages}
      onChange={(e) => setNewCatalogItemPages(e.target.value)}
      placeholder="Ej.: 250"
    />
  </div>

  <div className="mb-3">
    <label className="block text-gray-700 text-sm font-bold mb-1">Foto (opcional)</label>
    <input
      type="file"
      accept="image/*"
      onChange={handleNewCatalogImageChange}
      className="block w-full text-sm text-gray-700"
    />
    {newCatalogItemImagePreview && (
      <img
        src={newCatalogItemImagePreview}
        alt="Vista previa"
        className="mt-2 w-24 h-24 object-cover rounded border"
      />
    )}
    <p className="text-xs text-gray-500 mt-1">
      Se agregará dentro de: <span className="italic">
        {breadcrumbs[breadcrumbs.length - 1]?.name}
      </span>
    </p>
  </div>

  <button
    onClick={handleAddCatalogItem}
    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg w-full"
  >
    Añadir Artículo al Catálogo
  </button>
</div>


          {/* Crear artículo (tu formulario actual) */}
          {/* ...tu formulario de crear artículo existente... */}
        </div>
      )}

      {/* Búsqueda */}
      <div className="mb-4">
        <label htmlFor="catalogSearch" className="block text-gray-700 text-sm font-bold mb-2">
          Buscar en el catálogo
        </label>
        <input
          id="catalogSearch"
          type="text"
          className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          placeholder="Ej.: Anatomía, 200 páginas…"
          value={catalogSearch}
          onChange={(e) => setCatalogSearch(e.target.value)}
        />
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>
            {catalogSearch
              ? `Mostrando ${filteredCatalogItems.length} resultado(s) en todas las carpetas`
              : `Carpetas: ${childFolders.length} · Artículos aquí: ${itemsInCurrentFolder.length}`}
          </span>
          {catalogSearch && (
            <button type="button" onClick={() => setCatalogSearch('')} className="underline hover:text-gray-700">
              Limpiar búsqueda
            </button>
          )}
        </div>
      </div>

      {/* Listado de carpetas (solo si no hay búsqueda) */}
      {!catalogSearch.trim() && (
        <div className="mb-6">
          {childFolders.length > 0 ? (
            <>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Carpetas</h4>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {childFolders.map(f => (
                  <li key={f.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                    <button onClick={() => setCurrentFolderId(f.id)} className="flex items-center gap-2 text-left">
                      <span className="text-2xl">📁</span>
                      <span className="font-medium text-gray-800">{f.name}</span>
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => handleDeleteFolder(f.id)}
                        className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded"
                      >
                        Borrar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-gray-600">No hay subcarpetas aquí.</p>
          )}
        </div>
      )}

      {/* Listado de artículos */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          Artículos {catalogSearch.trim() && '(resultados globales)'}
        </h4>
        {itemsToShow.length === 0 ? (
          <p className="text-gray-600">
            {catalogSearch.trim()
              ? 'No se encontraron artículos que coincidan con la búsqueda.'
              : 'No hay artículos en esta carpeta.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {itemsToShow.map(item => (
              <li key={item.id} className="p-4 border rounded-lg bg-gray-50">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:justify-between">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <img
                      src={item.imageUrl || 'https://via.placeholder.com/96?text=Sin+foto'}
                      alt={item.name}
                      className="w-24 h-24 object-cover rounded border"
                    />
                    <div>
                      <p className="font-semibold text-gray-800">{item.name}</p>
                      <p className="text-sm text-gray-600">{item.pageCount} páginas</p>
                      {/* PRECIOS LLAMATIVOS */}
{(() => {
  const priceCash = calculatePrice(item.pageCount, true, 'efectivo', item.pageCount);
  const priceTransfer = calculatePrice(item.pageCount, true, 'transferencia', item.pageCount);
  const savings = Math.max(0, priceTransfer - priceCash);

  return (
  <div className="mt-2 flex flex-col sm:flex-row gap-3 w-full">
  <div className="flex-1 min-w-0">
    <PricePill
      label="Efectivo"
      price={priceCash}
      variant="cash"
      sublabel={savings > 0 ? `Ahorra ${formatARS(savings)} pagando en efectivo` : 'Incluye anillado si corresponde'}
    />
  </div>
  <div className="flex-1 min-w-0">
    <PricePill
      label="Transferencia"
      price={priceTransfer}
      variant="transfer"
      /* sublabel eliminado */
    />
  </div>
</div>

  );
})()}

                    </div>
                  </div>

                  <div className="w-full sm:w-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:self-start">

                    <button
  onClick={() => handleAddToCart(item)}
  className="bg-blue-500 hover:bg-blue-700 text-white font-bold px-4 py-3 rounded-lg w-full
            cursor-pointer transition-transform duration-100 transform-gpu
            active:translate-y-[2px] active:scale-[0.98] shadow-md active:shadow-sm"
  style={{ fontFamily: 'Inter, sans-serif', WebkitTapHighlightColor: 'transparent' }}
>
  Añadir al Carrito
</button>


                    {isOwner && (
                      <>
                        <button
                          onClick={() => handleDeleteCatalogItem(item.id)}
                          className="bg-red-500 hover:bg-red-600 text-white py-2 px-3 rounded-lg text-sm"
                        >
                          Eliminar
                        </button>

                        <label className="text-xs text-gray-700 cursor-pointer bg-gray-200 hover:bg-gray-300 py-2 px-3 rounded-lg">
                          Cambiar foto
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUpdateCatalogItemImage(item.id, f);
                            }}
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};


  const renderCart = () => {
    const total = cartItems.reduce((s, it) => s + it.price, 0);
    return (
      <div className="p-4 sm:p-6 bg-white rounded-lg shadow-md w-full max-w-lg mx-auto">
        <h2
  className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800"
  style={{ fontFamily: 'Inter, sans-serif' }}
>
  Tu Carrito
</h2>

        <div className="mb-6">
  <label className="block text-gray-700 text-sm font-bold mb-2">Elegí el método de pago:</label>
  <div className="flex space-x-4">
    <label className="inline-flex items-center">
      <input type="radio" className="form-radio h-4 w-4 text-blue-600"
             name="cartPaymentMethod" value="efectivo"
             checked={cartPaymentMethod === 'efectivo'}
             onChange={() => setCartPaymentMethod('efectivo')} />
      <span className="ml-2 text-gray-700">Efectivo</span>
    </label>
    <label className="inline-flex items-center">
      <input type="radio" className="form-radio h-4 w-4 text-blue-600"
             name="cartPaymentMethod" value="transferencia"
             checked={cartPaymentMethod === 'transferencia'}
             onChange={() => setCartPaymentMethod('transferencia')} />
      <span className="ml-2 text-gray-700">Transferencia</span>
    </label>
  </div>
</div>

        {cartItems.length === 0 ? (
          <p className="text-gray-600 mb-4">El carrito está vacío.</p>
        ) : (
          <ul className="space-y-4 mb-6">
            {cartItems.map((it, idx) => (
              <li key={idx} className="p-4 border rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-50">
                <div className="mb-2 sm:mb-0">
                  <p className="font-semibold text-gray-800">{it.name}</p>
                  <p className="text-sm text-gray-600">
                    {it.pageCount} páginas {it.binding ? ', con anillado' : ''}
                    {it.paymentMethod && ` (pago en ${it.paymentMethod})`}
                  </p>
                  <p className="text-lg font-bold text-blue-600">$ {it.price.toFixed(2)}</p>
                </div>
                <button onClick={() => handleRemoveFromCart(idx)} className="bg-red-500 hover:bg-red-600 text-white py-2 px-3 rounded-lg text-sm">
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-6 p-4 border-t-2 border-gray-2 00 pt-4">
          <p className="text-lg sm:text-xl font-bold text-gray-800">Total: <span className="text-blue-600">$ {total.toFixed(2)}</span></p>
          <p className="text-sm text-gray-700 mt-2">Seña (20% por transferencia): ${ (total * 0.20).toFixed(2) }</p>
          <p className="text-sm text-gray-700">Restante (80%): ${ (total * 0.80).toFixed(2) }</p>
        </div>

        <div className="mb-4">
          <label htmlFor="customerName" className="block text-gray-700 text-sm font-bold mb-2">Tu Nombre Completo:</label>
          <input type="text" id="customerName"
                 className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                 value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Ej. Juan Pérez" />
        </div>

        <div className="mb-4">
  <label htmlFor="customerPhone" className="block text-gray-700 text-sm font-bold mb-2">
    Tu número de WhatsApp (solo dígitos, formato internacional sin “+”)
  </label>
  <input
    id="customerPhone"
    type="tel"
    inputMode="numeric"
    className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
    value={customerPhone}
    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
    placeholder="Ej.: 54911XXXXXXXX"
  />
  {!isValidPhone(customerPhone) && customerPhone.length > 0 && (
    <p className="text-xs text-red-600 mt-1">Verificá que tenga entre 10 y 15 dígitos.</p>
  )}
</div>


        <div className="mb-6">
          <label className="flex items-center text-gray-700 text-sm font-bold">
            <input type="checkbox" className="form-checkbox h-5 w-5 text-blue-600 rounded"
                   checked={sendToInterior} onChange={(e) => setSendToInterior(e.target.checked)} />
            <span className="ml-2">Envíos al interior por Andreani</span>
          </label>
          {sendToInterior && (
            <p className="text-xs text-gray-500 mt-1 italic">
              Los envíos al interior se acordarán mediante WhatsApp. Podrás calcular los costes del envío una vez que finalices el pedido.
            </p>
          )}
        </div>

        <button onClick={handleFinalizePurchase}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition transform duration-100 active:translate-y-[2px] active:scale-[0.98] shadow-md active:shadow-sm"
                style={{ fontFamily: 'Inter, sans-serif' }}
                disabled={!cartItems.length || !isValidPhone(customerPhone)}>
          Finalizar Compra y Enviar por WhatsApp
        </button>
      </div>
    );
  };

  const renderOwnerSettings = () => (
    <div className="p-4 sm:p-6 bg-white rounded-lg shadow-md w-full max-w-lg mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800">Configuración del Dueño</h2>
      <p className="text-gray-600 mb-4">Ajustá precios y condiciones de tu fotocopiadora.</p>

      <div className="mb-6">const renderOwnerSetting
        <h3 className="text-lg sm:text-xl font-semibold mb-3 text-gray-700">Precios de Impresión por Página</h3>
        <div className="mb-4">
          <label htmlFor="priceUnder100" className="block text-gray-700 text-sm font-bold mb-2">Precio por página (hasta 100):</label>
          <input type="number" id="priceUnder100"
                 className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                 value={settings.pricePerPageUnder100} onChange={(e) => setSettings({ ...settings, pricePerPageUnder100: e.target.value })}
                 min="0" step="0.01" />
        </div>
        <div className="mb-4">
          <label htmlFor="priceOver100" className="block text-gray-700 text-sm font-bold mb-2">Precio por página (más de 100):</label>
          <input type="number" id="priceOver100"
                 className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                 value={settings.pricePerPageOver100} onChange={(e) => setSettings({ ...settings, pricePerPageOver100: e.target.value })}
                 min="0" step="0.01" />
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg sm:text-xl font-semibold mb-3 text-gray-700">Precios de Anillado</h3>
        <div className="mb-4">
          <label htmlFor="bindingUnder100" className="block text-gray-700 text-sm font-bold mb-2">Costo de anillado (hasta 200):</label>
          <input type="number" id="bindingUnder100"
                 className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                 value={settings.bindingPriceUnder200} onChange={(e) => setSettings({ ...settings, bindingPriceUnder200: e.target.value })}
                 min="0" step="0.01" />
        </div>
        <div className="mb-4">
          <label htmlFor="bindingOver100" className="block text-gray-700 text-sm font-bold mb-2">Costo de anillado (más de 200):</label>
          <input type="number" id="bindingOver100"
                 className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                 value={settings.bindingPriceOver200} onChange={(e) => setSettings({ ...settings, bindingPriceOver200: e.target.value })}
                 min="0" step="0.01" />
        </div>
        <div className="mb-4">
          <label htmlFor="maxPagesBinding" className="block text-gray-700 text-sm font-bold mb-2">Máximo de páginas por anillado:</label>
          <input type="number" id="maxPagesBinding"
                 className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                 value={settings.maxPagesPerBinding} onChange={(e) => setSettings({ ...settings, maxPagesPerBinding: e.target.value })}
                 min="1" />
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg sm:text-xl font-semibold mb-3 text-gray-700">Ajustes de Pago</h3>
        <div className="mb-4">
          <label htmlFor="cashDiscount" className="block text-gray-700 text-sm font-bold mb-2">Descuento por Efectivo (%):</label>
          <input type="number" id="cashDiscount"
                 className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                 value={settings.cashDiscountPercentage} onChange={(e) => setSettings({ ...settings, cashDiscountPercentage: e.target.value })}
                 min="0" max="100" step="0.1" />
        </div>
        <div className="mb-4">
          <label htmlFor="transferSurcharge" className="block text-gray-700 text-sm font-bold mb-2">Recargo por Transferencia (%):</label>
          <input type="number" id="transferSurcharge"
                 className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                 value={settings.transferSurchargePercentage} onChange={(e) => setSettings({ ...settings, transferSurchargePercentage: e.target.value })}
                 min="0" max="100" step="0.1" />
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg sm:text-xl font-semibold mb-3 text-gray-700">Mensaje de Tiempo de Demora</h3>
        <div className="mb-4">
          <label htmlFor="deliveryTimeMessage" className="block text-gray-700 text-sm font-bold mb-2">Mensaje a mostrar:</label>
          <textarea id="deliveryTimeMessage" rows="3"
                    className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    value={settings.deliveryTimeMessage} onChange={(e) => setSettings({ ...settings, deliveryTimeMessage: e.target.value })}></textarea>
        </div>
      </div>

      <button onClick={handleSaveSettings} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline w-full">
        Guardar Configuración
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col items-center py-4 sm:py-8 px-2 sm:px-4">
      <div className="w-full max-w-lg sm:max-w-4xl bg-white rounded-lg shadow-xl overflow-hidden mb-8">
        <nav className="flex flex-col sm:flex-row justify-between items-center p-4 bg-blue-700 text-white shadow-md rounded-t-lg">
          <div className="flex items-center gap-2 mb-2 sm:mb-0">
  <img
  src={logo}
  alt="Fotocopiadora Todo Color"
  className="w-64 sm:w-64 md:w-72 h-auto object-contain"
/>


  <span className="sr-only">Fotocopiadora Todo Color</span>
</div>
          <div className="flex flex-wrap justify-center space-x-2 sm:space-x-4 mt-2 sm:mt-0">
            <button
  onClick={() => setCurrentPage('calculator')}
  className={`px-3 sm:px-4 py-2 rounded-lg ${currentPage === 'calculator' ? 'bg-blue-800' : 'hover:bg-blue-600'} text-white`}
  style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}
>
  Calculadora
</button>

<button
  onClick={() => setCurrentPage('catalog')}
  className={`px-3 sm:px-4 py-2 rounded-lg ${currentPage === 'catalog' ? 'bg-blue-800' : 'hover:bg-blue-600'} text-white`}
  style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}
>
  Catálogo
</button>

<button
  onClick={() => setCurrentPage('cart')}
  className={`px-3 sm:px-4 py-2 rounded-lg ${currentPage === 'cart' ? 'bg-blue-800' : 'hover:bg-blue-600'} text-white`}
  style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}
>
  Carrito ({cartItems.length})
</button>

            {isOwner && (
              <button onClick={() => setCurrentPage('owner-settings')}
                className={`px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base transition-colors duration-200 ${currentPage === 'owner-settings' ? 'bg-blue-800' : 'hover:bg-blue-600'}`}>
                Dueño
              </button>
            )}
          </div>
        </nav>

        <div className="p-4 sm:p-8">
          {message && (
            <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 rounded-lg mb-6 shadow-sm" role="alert">
              <p className="font-bold">Mensaje:</p>
              <p>{message}</p>
            </div>
          )}

          {settings.deliveryTimeMessage && (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded-lg mb-6 shadow-sm" role="alert">
              <p className="font-bold">¡Importante!</p>
              <p>{settings.deliveryTimeMessage}</p>
            </div>
          )}

          {!isAuthReady ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
              <p className="ml-4 text-gray-700 text-lg">Cargando aplicación...</p>
            </div>
          ) : (
            <>
              {currentPage === 'calculator' && renderCalculator()}
              {currentPage === 'catalog' && renderCatalog()}
              {currentPage === 'cart' && renderCart()}
              {isOwner && currentPage === 'owner-settings' && renderOwnerSettings()}
            </>
          )}
        </div>
      </div>
      <div className="text-gray-500 text-sm mt-4 text-center">
        ID de Usuario (para referencia): <span className="font-semibold">{userId || 'Cargando...'}</span>
      </div>
    </div>
  );
};

export default App;

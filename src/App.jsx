import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, deleteDoc } from 'firebase/firestore';

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

// Replace after first login with your UID to unlock owner mode
// UID principal del dueño (donde vive el catálogo)
const OWNER_USER_ID = '2WNDK6JZFdX70kw2MOPMyHr8fRC2';

// Lista de UIDs que pueden entrar en modo dueño
const OWNER_UIDS = [
  OWNER_USER_ID, '2WNDK6JZFdX70kw2MOPMyHr8fRC2'
  // Si querés más dueños, agregalos acá como strings:
  // 'otroUID', 
];
;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

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

  // Cart
  const [cartItems, setCartItems] = useState([]);
  const [sendToInterior, setSendToInterior] = useState(false);
  const [customerName, setCustomerName] = useState('');

  // NUEVO: método de pago elegido a nivel carrito
const [cartPaymentMethod, setCartPaymentMethod] = useState('transferencia');

  // Settings
  const [settings, setSettings] = useState({
    pricePerPageUnder100: 10,
    pricePerPageOver100: 8,
    bindingPriceUnder100: 100,
    bindingPriceOver100: 150,
    maxPagesPerBinding: 600,
    cashDiscountPercentage: 10,
    transferSurchargePercentage: 5,
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


  // Fetch settings
  useEffect(() => {
    if (!isAuthReady || !userId) return;
    const settingsDocRef = doc(db, 'artifacts', appId, 'users', userId, 'user_settings', 'general');
    const unsub = onSnapshot(settingsDocRef, (snap) => {
      if (snap.exists()) {
        setSettings((prev) => ({ ...prev, ...snap.data() }));
      } else {
        setDoc(settingsDocRef, settings).catch((e) => console.error("Default settings error:", e));
      }
    }, (err) => {
      console.error(err);
      setMessage(`Error al cargar la configuración: ${err.message}`);
    });
    return () => unsub();
  }, [isAuthReady, userId]);

  // Fetch catalog (todos leen el catálogo del dueño)
useEffect(() => {
  if (!isAuthReady) return;
  const colRef = collection(db,'artifacts',appId,'users',OWNER_USER_ID,'user_catalog_items');
  const unsub = onSnapshot(colRef, (snap) => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setCatalogItems(items);
  }, (err) => setMessage(`Error al cargar el catálogo: ${err.message}`));
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
      binding = pages > 100 ? n * settings.bindingPriceOver100 : n * settings.bindingPriceUnder100;
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
    const ownerPhoneNumber = '+5492215246895'; // Cambiar por el real
    let msg = `¡Hola! Me gustaría hacer un pedido de fotocopias.\n`;
    msg += `Páginas: ${numPages}\n`;
    msg += `Archivo a imprimir: ${selectedFile ? selectedFile.name : 'No se subió archivo'}\n`;
    msg += `Anillado: ${includeBinding ? 'Sí' : 'No'}\n`;
    msg += `Método de pago para el cálculo: ${paymentMethod}\n`;
    msg += `Precio estimado: $${calculatedPrice.toFixed(2)}\n`;
    msg += `\n*Nota: Por favor, adjunta el archivo por este medio.*`;
    const url = `https://wa.me/${+5492215246895}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    setMessage("Pedido enviado a WhatsApp. Adjuntá el archivo manualmente.");
  };

  // Add catalog item to cart
  const handleAddToCart = (item) => {
    const totalPagesInCart = cartItems.reduce((s, it) => s + it.pageCount, 0);
    const price = calculatePrice(item.pageCount, false, cartPaymentMethod, totalPagesInCart + item.pageCount);
    setCartItems((prev) => [...prev, { ...item, type: 'catalog', price, paymentMethod: cartPaymentMethod, binding: false }]);
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
    const ownerPhoneNumber = '+5491112345678'; // Cambiar por el real
    let total = 0;
    let msg = `¡Hola! Me gustaría finalizar mi compra de la fotocopiadora.\n`;
    msg += `Nombre del Cliente: ${customerName.trim()}\n\n`;
    msg += `Método de pago elegido: ${cartPaymentMethod}\n\n`;
    msg += `Detalle del pedido:\n`;
    cartItems.forEach((it) => {
      total += it.price;
      if (it.type === 'catalog') {
        msg += `- ${it.name} (${it.pageCount} páginas): $${it.price.toFixed(2)}\n`;
      } else {
        msg += `Fotocopias (${it.pageCount} páginas${it.binding ? ', anillado' : ''}, pago en ${it.paymentMethod}): $${it.price.toFixed(2)}\n`;
        if (it.file && it.file !== 'No file') {
          msg += `  (Archivo: ${it.file}. Por favor, envía este archivo aparte.)\n`;
        }
      }
    });
    const down = total * 0.20, rest = total * 0.80;
    msg += `\nSubtotal: $${total.toFixed(2)}\n`;
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
    if (!userId) { setMessage("Error: Usuario no autenticado para guardar."); return; }
    try {
      const ref = doc(db, 'artifacts', appId, 'users', userId, 'user_settings', 'general');
      await setDoc(ref, {
        pricePerPageUnder100: parseFloat(settings.pricePerPageUnder100),
        pricePerPageOver100: parseFloat(settings.pricePerPageOver100),
        bindingPriceUnder100: parseFloat(settings.bindingPriceUnder100),
        bindingPriceOver100: parseFloat(settings.bindingPriceOver100),
        maxPagesPerBinding: parseInt(settings.maxPagesPerBinding, 10),
        cashDiscountPercentage: parseFloat(settings.cashDiscountPercentage),
        transferSurchargePercentage: parseFloat(settings.transferSurchargePercentage),
        deliveryTimeMessage: settings.deliveryTimeMessage,
      });
      setMessage("Configuración guardada exitosamente.");
    } catch (e) {
      console.error(e);
      setMessage(`Error al guardar la configuración: ${e.message}`);
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
      db, 'artifacts', appId, 'users', OWNER_USER_ID, 'user_catalog_items'
    );
    await addDoc(colRef, {
      name: newCatalogItemName,
      pageCount: parseInt(newCatalogItemPages, 10),
    });
    setNewCatalogItemName('');
    setNewCatalogItemPages('');
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
      db, 'artifacts', appId, 'users', OWNER_USER_ID, 'user_catalog_items', id
    );
    await deleteDoc(ref);
    setMessage("Artículo del catálogo eliminado exitosamente.");
  } catch (e) {
    console.error(e);
    setMessage(`Error al eliminar artículo: ${e.message}`);
  }
};


  const renderCalculator = () => (
  <div className="p-4 sm:p-6 bg-white rounded-lg shadow-md w-full max-w-lg mx-auto">
    <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800">Calculadora de Copias</h2>

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

    <button onClick={handleSendCalculatorOrder}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline w-full mb-3">
      Enviar Pedido por WhatsApp
    </button>
    <button onClick={handleAddCalculatorToCart}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline w-full">
      Añadir al Carrito
    </button>
  </div>
);


  const renderCatalog = () => (
    <div className="p-4 sm:p-6 bg-white rounded-lg shadow-md w-full max-w-lg mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800">Catálogo de Artículos</h2>
      {isOwner && (
        <div className="mb-6 border-b pb-4 border-gray-200">
          <h3 className="text-lg sm:text-xl font-semibold mb-3 text-gray-700">Administrar Artículos (Dueño)</h3>
          <div className="mb-4">
            <label htmlFor="newItemName" className="block text-gray-700 text-sm font-bold mb-2">Nombre del Artículo:</label>
            <input type="text" id="newItemName"
                   className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                   value={newCatalogItemName} onChange={(e) => setNewCatalogItemName(e.target.value)} />
          </div>
          <div className="mb-4">
            <label htmlFor="newItemPages" className="block text-gray-700 text-sm font-bold mb-2">Cantidad de Páginas:</label>
            <input type="number" id="newItemPages"
                   className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                   value={newCatalogItemPages} onChange={(e) => setNewCatalogItemPages(e.target.value)} min="1" />
          </div>
          <button onClick={handleAddCatalogItem}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline w-full">
            Añadir Artículo al Catálogo
          </button>
        </div>
      )}

      <div>
        <h3 className="text-lg sm:text-xl font-semibold mb-4 text-gray-700">Artículos Disponibles</h3>
        {catalogItems.length === 0 ? (
          <p className="text-gray-600">No hay artículos en el catálogo.</p>
        ) : (
          <ul className="space-y-4">
            {catalogItems.map(item => (
              <li key={item.id} className="p-4 border rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-50">
                <div className="mb-2 sm:mb-0">
                  <p className="font-semibold text-gray-800">{item.name}</p>
                  <p className="text-sm text-gray-600">{item.pageCount} páginas</p>
                  <div className="text-sm text-gray-700 mt-2 space-y-1">
  <p>
    <span className="font-semibold">Precio transferencia:</span>{' '}
    ${calculatePrice(item.pageCount, false, 'transferencia', item.pageCount).toFixed(2)}
  </p>
  <p>
    <span className="font-semibold">Precio efectivo:</span>{' '}
    ${calculatePrice(item.pageCount, false, 'efectivo', item.pageCount).toFixed(2)}
  </p>
</div>
</div>
                <div className="flex space-x-2">
                  <button onClick={() => handleAddToCart(item)} className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded-lg text-sm">
                    Añadir al Carrito
                  </button>
                  {isOwner && (
                    <button onClick={() => handleDeleteCatalogItem(item.id)} className="bg-red-500 hover:bg-red-600 text-white py-2 px-3 rounded-lg text-sm">
                      Eliminar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const renderCart = () => {
    const total = cartItems.reduce((s, it) => s + it.price, 0);
    return (
      <div className="p-4 sm:p-6 bg-white rounded-lg shadow-md w-full max-w-lg mx-auto">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800">Tu Carrito</h2>
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
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline w-full"
                disabled={cartItems.length === 0}>
          Finalizar Compra y Enviar por WhatsApp
        </button>
      </div>
    );
  };

  const renderOwnerSettings = () => (
    <div className="p-4 sm:p-6 bg-white rounded-lg shadow-md w-full max-w-lg mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800">Configuración del Dueño</h2>
      <p className="text-gray-600 mb-4">Ajustá precios y condiciones de tu fotocopiadora.</p>

      <div className="mb-6">
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
          <label htmlFor="bindingUnder100" className="block text-gray-700 text-sm font-bold mb-2">Costo de anillado (hasta 100):</label>
          <input type="number" id="bindingUnder100"
                 className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                 value={settings.bindingPriceUnder100} onChange={(e) => setSettings({ ...settings, bindingPriceUnder100: e.target.value })}
                 min="0" step="0.01" />
        </div>
        <div className="mb-4">
          <label htmlFor="bindingOver100" className="block text-gray-700 text-sm font-bold mb-2">Costo de anillado (más de 100):</label>
          <input type="number" id="bindingOver100"
                 className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                 value={settings.bindingPriceOver100} onChange={(e) => setSettings({ ...settings, bindingPriceOver100: e.target.value })}
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
          <h1 className="text-xl sm:text-3xl font-extrabold mb-2 sm:mb-0">Fotocopiadora Online</h1>
          <div className="flex flex-wrap justify-center space-x-2 sm:space-x-4 mt-2 sm:mt-0">
            <button onClick={() => setCurrentPage('calculator')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base transition-colors duration-200 ${currentPage === 'calculator' ? 'bg-blue-800' : 'hover:bg-blue-600'}`}>
              Calculadora
            </button>
            <button onClick={() => setCurrentPage('catalog')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base transition-colors duration-200 ${currentPage === 'catalog' ? 'bg-blue-800' : 'hover:bg-blue-600'}`}>
              Catálogo
            </button>
            <button onClick={() => setCurrentPage('cart')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base transition-colors duration-200 ${currentPage === 'cart' ? 'bg-blue-800' : 'hover:bg-blue-600'}`}>
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

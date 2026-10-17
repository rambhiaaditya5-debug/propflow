import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  IndianRupee,
  PackagePlus,
  Pencil,
  Store,
  UserPlus,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { db } from "./firebase";
import { downloadOrderDocument } from "./order-document";
import { formatDate, formatMoney } from "./order-formatting";
import "./propflow.css";

const ORDER_STATUS = {
  IN_QUEUE: "in_queue",
  PAYMENT_LEFT: "payment_left",
  PAID: "paid",
} as const;

const PAYMENT_METHODS = ["Cash", "UPI", "Bank"];

type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

interface Order {
  id: string;
  description: string;
  items?: string[];
  companyName: string;
  shootLocation: string;
  vendorId: string;
  vendorName: string;
  vendorMobile: string;
  receivingDate: string;
  givingDate: string;
  amount: number;
  receivedAmount: number;
  pendingAmount: number;
  staff: string;
  status: OrderStatus;
  paymentMethod: string;
  challanNumber?: number;
  createdAt: unknown;
  givenAt: unknown;
  paidAt: unknown;
}

interface Vendor {
  id: string;
  fullName: string;
  mobileNumber: string;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function calculatePending(order: Order) {
  if (typeof order.pendingAmount === "number") return order.pendingAmount;
  return Math.max(Number(order.amount || 0) - Number(order.receivedAmount || 0), 0);
}

function saveWithTimeout<T>(savePromise: Promise<T>): Promise<T> {
  return Promise.race([
    savePromise,
    new Promise<T>((_, reject) => {
      window.setTimeout(
        () =>
          reject(
            new Error(
              "Saving took too long. Please check Firebase rules and internet."
            )
          ),
        12000
      );
    }),
  ]);
}

async function getOrAssignChallanNumber(orderId: string) {
  const orderRef = doc(db, "orders", orderId);
  const counterRef = doc(db, "documentCounters", "propflowChallan");

  return runTransaction(db, async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists()) {
      throw new Error("This order no longer exists.");
    }

    const existingNumber = orderSnapshot.data().challanNumber;
    if (
      typeof existingNumber === "number" &&
      Number.isInteger(existingNumber) &&
      existingNumber > 0
    ) {
      return existingNumber;
    }

    const counterSnapshot = await transaction.get(counterRef);
    const lastIssuedNumber = Number(
      counterSnapshot.data()?.lastIssuedNumber ?? 0
    );
    const challanNumber =
      (Number.isFinite(lastIssuedNumber) && lastIssuedNumber > 0
        ? Math.floor(lastIssuedNumber)
        : 0) + 1;

    transaction.set(
      counterRef,
      { lastIssuedNumber: challanNumber, updatedAt: serverTimestamp() },
      { merge: true }
    );
    transaction.update(orderRef, { challanNumber });
    return challanNumber;
  });
}

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [isSaving, setIsSaving] = useState(false);
  const [isVendorOpen, setIsVendorOpen] = useState(false);
  const [isSavingVendor, setIsSavingVendor] = useState(false);
  const [formError, setFormError] = useState("");
  const [vendorError, setVendorError] = useState("");
  const [form, setForm] = useState({
    items: [""] as string[],
    companyName: "",
    shootLocation: "",
    vendorId: "",
    receivingDate: todayInputValue(),
    givingDate: todayInputValue(),
    amount: "",
    staff: "Amit",
  });
  const [vendorForm, setVendorForm] = useState({
    fullName: "",
    mobileNumber: "",
  });

  // Vendor filter state for Payment Left and Paid columns
  const [paymentLeftVendorFilter, setPaymentLeftVendorFilter] = useState("");
  const [paidVendorFilter, setPaidVendorFilter] = useState("");

  useEffect(() => {
    const ordersQuery = query(
      collection(db, "orders"),
      orderBy("givingDate", "asc")
    );
    return onSnapshot(ordersQuery, (snapshot) => {
      setOrders(
        snapshot.docs.map((orderDoc) => ({
          id: orderDoc.id,
          ...(orderDoc.data() as Omit<Order, "id">),
        }))
      );
    });
  }, []);

  useEffect(() => {
    const vendorsQuery = query(
      collection(db, "vendors"),
      orderBy("fullName", "asc")
    );
    return onSnapshot(vendorsQuery, (snapshot) => {
      setVendors(
        snapshot.docs.map((vendorDoc) => ({
          id: vendorDoc.id,
          ...(vendorDoc.data() as Omit<Vendor, "id">),
        }))
      );
    });
  }, []);

  const inQueueOrders = useMemo(
    () => orders.filter((order) => order.status === ORDER_STATUS.IN_QUEUE),
    [orders]
  );

  const paymentLeftOrders = useMemo(
    () => orders.filter((order) => order.status === ORDER_STATUS.PAYMENT_LEFT),
    [orders]
  );

  const paidOrders = useMemo(
    () => orders.filter((order) => order.status === ORDER_STATUS.PAID),
    [orders]
  );

  // Unique vendors for each column (only vendors who have orders in that column)
  const paymentLeftVendors = useMemo(() => {
    const seen = new Set<string>();
    return paymentLeftOrders
      .filter((o) => {
        if (!o.vendorName || seen.has(o.vendorName)) return false;
        seen.add(o.vendorName);
        return true;
      })
      .map((o) => ({ id: o.vendorId, name: o.vendorName }));
  }, [paymentLeftOrders]);

  const paidVendors = useMemo(() => {
    const seen = new Set<string>();
    return paidOrders
      .filter((o) => {
        if (!o.vendorName || seen.has(o.vendorName)) return false;
        seen.add(o.vendorName);
        return true;
      })
      .map((o) => ({ id: o.vendorId, name: o.vendorName }));
  }, [paidOrders]);

  // Filtered lists
  const filteredPaymentLeftOrders = useMemo(
    () =>
      paymentLeftVendorFilter
        ? paymentLeftOrders.filter((o) => o.vendorName === paymentLeftVendorFilter)
        : paymentLeftOrders,
    [paymentLeftOrders, paymentLeftVendorFilter]
  );

  const filteredPaidOrders = useMemo(
    () =>
      paidVendorFilter
        ? paidOrders.filter((o) => o.vendorName === paidVendorFilter)
        : paidOrders,
    [paidOrders, paidVendorFilter]
  );

  const itemFocusIndex = useRef<number | null>(null);

  useEffect(() => {
    if (itemFocusIndex.current === null) return;
    const input = document.querySelector<HTMLInputElement>(
      `[data-item-index="${itemFocusIndex.current}"]`
    );
    itemFocusIndex.current = null;
    input?.focus();
  }, [form.items.length]);

  function updateItem(index: number, value: string) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, i) => (i === index ? value : item)),
    }));
  }

  function addItemAfter(index: number) {
    itemFocusIndex.current = index + 1;
    setForm((current) => {
      const next = [...current.items];
      next.splice(index + 1, 0, "");
      return { ...current, items: next };
    });
  }

  function removeItem(index: number) {
    setForm((current) => {
      if (current.items.length <= 1) return { ...current, items: [""] };
      return {
        ...current,
        items: current.items.filter((_, i) => i !== index),
      };
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const items = form.items.map((item) => item.trim()).filter(Boolean);
    const description = items.join("\n");
    const companyName = form.companyName.trim();
    const shootLocation = form.shootLocation.trim();
    const amount = Number(form.amount);
    const selectedVendor = vendors.find((vendor) => vendor.id === form.vendorId);

    if (
      items.length === 0 ||
      !companyName ||
      !shootLocation ||
      !selectedVendor ||
      !form.receivingDate ||
      !form.givingDate ||
      !form.staff ||
      !Number.isFinite(amount)
    ) {
      setFormError(
        "Please fill all order details, select a vendor, and enter the order amount."
      );
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      await saveWithTimeout(
        addDoc(collection(db, "orders"), {
          description,
          items,
          companyName,
          shootLocation,
          vendorId: selectedVendor.id,
          vendorName: selectedVendor.fullName,
          vendorMobile: selectedVendor.mobileNumber,
          receivingDate: form.receivingDate,
          givingDate: form.givingDate,
          amount,
          receivedAmount: 0,
          pendingAmount: amount,
          staff: form.staff,
          status: ORDER_STATUS.IN_QUEUE,
          paymentMethod: "",
          createdAt: serverTimestamp(),
          givenAt: null,
          paidAt: null,
        })
      );

      setForm({
        items: [""],
        companyName: "",
        shootLocation: "",
        vendorId: form.vendorId,
        receivingDate: todayInputValue(),
        givingDate: todayInputValue(),
        amount: "",
        staff: form.staff,
      });
    } catch (error: unknown) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Order could not be saved. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVendorSubmit(event: React.FormEvent) {
    event.preventDefault();
    const fullName = vendorForm.fullName.trim();
    const mobileNumber = vendorForm.mobileNumber.trim();
    if (!fullName || !mobileNumber) return;

    setIsSavingVendor(true);
    setVendorError("");
    try {
      await saveWithTimeout(
        addDoc(collection(db, "vendors"), {
          fullName,
          mobileNumber,
          createdAt: serverTimestamp(),
        })
      );
      setVendorForm({ fullName: "", mobileNumber: "" });
    } catch (error: unknown) {
      setVendorError(
        error instanceof Error
          ? error.message
          : "Vendor could not be saved. Please try again."
      );
    } finally {
      setIsSavingVendor(false);
    }
  }

  async function markGiven(orderId: string) {
    await updateDoc(doc(db, "orders", orderId), {
      status: ORDER_STATUS.PAYMENT_LEFT,
      givenAt: serverTimestamp(),
    });
  }

  async function updateOrderAmount(orderId: string, newAmount: number) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const receivedAmount = Number(order.receivedAmount || 0);
    const pendingAmount = Math.max(newAmount - receivedAmount, 0);
    await updateDoc(doc(db, "orders", orderId), {
      amount: newAmount,
      pendingAmount,
    });
  }

  async function setPaymentMethod(orderId: string, paymentMethod: string) {
    await updateDoc(doc(db, "orders", orderId), { paymentMethod });
  }

  async function markPaid(orderId: string, paymentMethod: string) {
    const selectedOrder = orders.find((order) => order.id === orderId);
    const amount = Number(selectedOrder?.amount || 0);
    await updateDoc(doc(db, "orders", orderId), {
      status: ORDER_STATUS.PAID,
      paymentMethod: paymentMethod || "Cash",
      receivedAmount: amount,
      pendingAmount: 0,
      paidAt: serverTimestamp(),
    });
  }

  async function handleDownloadOrder(order: Order) {
    try {
      const challanNumber = await getOrAssignChallanNumber(order.id);
      await downloadOrderDocument({ ...order, challanNumber });
    } catch (error) {
      console.error("Could not download the order document:", error);
      window.alert(
        error instanceof Error
          ? `The Word document could not be created: ${error.message}`
          : "The Word document could not be created. Please try downloading it again."
      );
    }
  }

  const showSingleColumn = activeTab !== "all";

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Internal prop shop queue</p>
          <h1>PropFlow</h1>
        </div>
        <div className="top-actions">
          <button
            className="vendor-button"
            type="button"
            onClick={() => setIsVendorOpen(!isVendorOpen)}
          >
            <UserPlus size={18} />
            Add Vendor
          </button>
          <div className="status-pill">
            <span>{inQueueOrders.length}</span> in queue
          </div>
        </div>
      </section>

      {isVendorOpen && (
        <form className="vendor-panel" onSubmit={handleVendorSubmit}>
          <div className="section-title">
            <Store size={20} />
            <h2>Add Vendor</h2>
          </div>
          <label>
            Full name
            <input
              value={vendorForm.fullName}
              onChange={(e) =>
                setVendorForm({ ...vendorForm, fullName: e.target.value })
              }
              placeholder="Example: Ramesh Sharma"
              required
            />
          </label>
          <label>
            Mobile number
            <input
              value={vendorForm.mobileNumber}
              onChange={(e) =>
                setVendorForm({ ...vendorForm, mobileNumber: e.target.value })
              }
              placeholder="Example: 9876543210"
              required
            />
          </label>
          <button className="primary-button" disabled={isSavingVendor}>
            {isSavingVendor ? "Saving..." : "Save Vendor"}
          </button>
          {vendorError && <p className="form-error">{vendorError}</p>}
        </form>
      )}

      <section className="workspace">
        <form className="order-form" onSubmit={handleSubmit}>
          <div className="section-title">
            <PackagePlus size={20} />
            <h2>New Order</h2>
          </div>

          <div className="items-block">
            <span className="items-title">Prop description (one item per line)</span>
            {form.items.map((item, index) => (
              <div className="item-row" key={index}>
                <span className="item-number">{index + 1}</span>
                <input
                  type="text"
                  data-item-index={index}
                  value={item}
                  onChange={(e) => updateItem(index, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItemAfter(index);
                    }
                  }}
                  placeholder={
                    index === 0
                      ? "Example: 4 brass lamps for studio shoot"
                      : "Next item"
                  }
                />
                {form.items.length > 1 && (
                  <button
                    type="button"
                    className="item-remove-btn"
                    title="Remove this item"
                    onClick={() => removeItem(index)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="item-add-btn"
              onClick={() => addItemAfter(form.items.length - 1)}
            >
              + Add new item
            </button>
          </div>

          <label>
            Company name
            <input
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              placeholder="Example: Red Studio"
              required
            />
          </label>

          <label>
            Shoot location
            <input
              value={form.shootLocation}
              onChange={(e) =>
                setForm({ ...form, shootLocation: e.target.value })
              }
              placeholder="Example: Film City, Goregaon"
              required
            />
          </label>

          <label>
            Vendor
            <select
              value={form.vendorId}
              onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
              required
            >
              <option value="">Select vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.fullName} - {vendor.mobileNumber}
                </option>
              ))}
            </select>
          </label>

          <label>
            Receiving date
            <input
              type="date"
              value={form.receivingDate}
              onChange={(e) =>
                setForm({ ...form, receivingDate: e.target.value })
              }
              required
            />
          </label>

          <label>
            Giving date
            <input
              type="date"
              value={form.givingDate}
              onChange={(e) => setForm({ ...form, givingDate: e.target.value })}
              required
            />
          </label>

          <label>
            Total order amount
            <input
              type="number"
              min="0"
              step="1"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Example: 2500"
              required
            />
          </label>

          <fieldset>
            <legend>Responsible staff</legend>
            <div className="staff-options">
              {["Amit", "Nilesh"].map((staffName) => (
                <label className="radio-card" key={staffName}>
                  <input
                    type="radio"
                    name="staff"
                    value={staffName}
                    checked={form.staff === staffName}
                    onChange={(e) =>
                      setForm({ ...form, staff: e.target.value })
                    }
                  />
                  <UserRound size={18} />
                  {staffName}
                </label>
              ))}
            </div>
          </fieldset>

          <button className="primary-button" disabled={isSaving}>
            {isSaving ? "Adding..." : "Add to Queue"}
          </button>
          {formError && <p className="form-error">{formError}</p>}
        </form>

        <section className="queue-area">
          <div className="tabs" aria-label="Queue views">
            <button
              className={activeTab === "all" ? "active" : ""}
              onClick={() => setActiveTab("all")}
              type="button"
            >
              Split View
            </button>
            <button
              className={activeTab === ORDER_STATUS.IN_QUEUE ? "active" : ""}
              onClick={() => setActiveTab(ORDER_STATUS.IN_QUEUE)}
              type="button"
            >
              In Queue
            </button>
            <button
              className={
                activeTab === ORDER_STATUS.PAYMENT_LEFT ? "active" : ""
              }
              onClick={() => setActiveTab(ORDER_STATUS.PAYMENT_LEFT)}
              type="button"
            >
              Payment Left
            </button>
            <button
              className={activeTab === ORDER_STATUS.PAID ? "active" : ""}
              onClick={() => setActiveTab(ORDER_STATUS.PAID)}
              type="button"
            >
              Paid
            </button>
          </div>

          <div className={showSingleColumn ? "queues single" : "queues"}>
            {(activeTab === "all" || activeTab === ORDER_STATUS.IN_QUEUE) && (
              <QueueColumn
                title="In Queue"
                count={inQueueOrders.length}
                emptyText="No active orders yet."
                orders={inQueueOrders}
                actionLabel="Given"
                actionIcon={<CheckCircle2 size={18} />}
                onAction={markGiven}
                onUpdateAmount={updateOrderAmount}
                onDownload={handleDownloadOrder}
                compactPaymentDetails
              />
            )}

            {(activeTab === "all" ||
              activeTab === ORDER_STATUS.PAYMENT_LEFT) && (
              <QueueColumn
                title="Payment Left"
                count={paymentLeftOrders.length}
                filteredCount={filteredPaymentLeftOrders.length}
                emptyText="No pending settlements."
                orders={filteredPaymentLeftOrders}
                isPaymentQueue
                onPaymentMethod={setPaymentMethod}
                onPaid={markPaid}
                onDownload={handleDownloadOrder}
                vendorFilter={paymentLeftVendorFilter}
                onVendorFilterChange={setPaymentLeftVendorFilter}
                vendorOptions={paymentLeftVendors}
              />
            )}

            {activeTab === ORDER_STATUS.PAID && (
              <QueueColumn
                title="Paid"
                count={paidOrders.length}
                filteredCount={filteredPaidOrders.length}
                emptyText="No paid orders yet."
                orders={filteredPaidOrders}
                isPaidQueue
                onDownload={handleDownloadOrder}
                vendorFilter={paidVendorFilter}
                onVendorFilterChange={setPaidVendorFilter}
                vendorOptions={paidVendors}
              />
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

interface QueueColumnProps {
  title: string;
  count: number;
  filteredCount?: number;
  emptyText: string;
  orders: Order[];
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: (id: string) => void;
  onUpdateAmount?: (id: string, amount: number) => void;
  onDownload: (order: Order) => void;
  isPaymentQueue?: boolean;
  isPaidQueue?: boolean;
  onPaymentMethod?: (id: string, method: string) => void;
  onPaid?: (id: string, method: string) => void;
  compactPaymentDetails?: boolean;
  vendorFilter?: string;
  onVendorFilterChange?: (v: string) => void;
  vendorOptions?: { id: string; name: string }[];
}

function QueueColumn({
  title,
  count,
  filteredCount,
  emptyText,
  orders,
  actionLabel,
  actionIcon,
  onAction,
  onUpdateAmount,
  onDownload,
  isPaymentQueue,
  isPaidQueue,
  onPaymentMethod,
  onPaid,
  compactPaymentDetails,
  vendorFilter,
  onVendorFilterChange,
  vendorOptions,
}: QueueColumnProps) {
  const displayCount =
    vendorFilter && filteredCount !== undefined ? filteredCount : count;

  return (
    <section className="queue-column">
      <div className="column-header">
        <h2>{title}</h2>
        <span>{displayCount}</span>
      </div>

      {/* Vendor filter dropdown (Payment Left & Paid columns) */}
      {onVendorFilterChange && (
        <div className="column-filter">
          <select
            value={vendorFilter}
            onChange={(e) => onVendorFilterChange(e.target.value)}
          >
            <option value="">All Vendors</option>
            {(vendorOptions || []).map((v) => (
              <option key={v.id} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="cards">
        {orders.length === 0 && (
          <p className="empty-state">{emptyText}</p>
        )}

        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            actionLabel={actionLabel}
            actionIcon={actionIcon}
            onAction={onAction}
            onUpdateAmount={onUpdateAmount}
            onDownload={onDownload}
            isPaymentQueue={isPaymentQueue}
            isPaidQueue={isPaidQueue}
            onPaymentMethod={onPaymentMethod}
            onPaid={onPaid}
            compactPaymentDetails={compactPaymentDetails}
          />
        ))}
      </div>
    </section>
  );
}

interface OrderCardProps {
  order: Order;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: (id: string) => void;
  onUpdateAmount?: (id: string, amount: number) => void;
  onDownload: (order: Order) => void;
  isPaymentQueue?: boolean;
  isPaidQueue?: boolean;
  onPaymentMethod?: (id: string, method: string) => void;
  onPaid?: (id: string, method: string) => void;
  compactPaymentDetails?: boolean;
}

function OrderCard({
  order,
  actionLabel,
  actionIcon,
  onAction,
  onUpdateAmount,
  onDownload,
  isPaymentQueue,
  isPaidQueue,
  onPaymentMethod,
  onPaid,
  compactPaymentDetails,
}: OrderCardProps) {
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");

  function startEdit() {
    setAmountDraft(String(order.amount || ""));
    setEditingAmount(true);
  }

  function cancelEdit() {
    setEditingAmount(false);
    setAmountDraft("");
  }

  async function saveAmount() {
    const parsed = Number(amountDraft);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (onUpdateAmount) await onUpdateAmount(order.id, parsed);
    setEditingAmount(false);
  }

  return (
    <article className="order-card">
      <div className="date-row">
        <span>
          <CalendarDays size={16} />
          Give: {formatDate(order.givingDate)}
        </span>
        <strong>{order.staff}</strong>
      </div>

      <p className="order-description">
        {order.items && order.items.length > 0
          ? order.items.map((item, index) => (
              <span key={index} className="order-description-line">
                {order.items && order.items.length > 1 ? `${index + 1}. ` : ""}
                {item}
              </span>
            ))
          : order.description}
      </p>

      <div className="detail-grid">
        <span>Vendor: {order.vendorName || "Not selected"}</span>
        <span>Mobile: {order.vendorMobile || "-"}</span>
        <span>Company: {order.companyName || "-"}</span>
        <span>Location: {order.shootLocation || "-"}</span>
        <span>Receiving: {formatDate(order.receivingDate)}</span>

        {/* Editable amount cell — only in In Queue */}
        {onUpdateAmount ? (
          <div className="amount-cell" style={{ gridColumn: "span 1" }}>
            {editingAmount ? (
              <div className="amount-edit-row">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={amountDraft}
                  onChange={(e) => setAmountDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveAmount();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  autoFocus
                />
                <button className="amount-save-btn" onClick={saveAmount}>
                  Save
                </button>
                <button className="amount-cancel-btn" onClick={cancelEdit}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <span>Amount: {formatMoney(order.amount)}</span>
                <button
                  className="amount-edit-btn"
                  onClick={startEdit}
                  title="Edit amount"
                >
                  <Pencil size={13} />
                </button>
              </>
            )}
          </div>
        ) : (
          <span>Amount: {formatMoney(order.amount)}</span>
        )}
      </div>

      {!compactPaymentDetails && (
        <div className="vendor-payment">
          <div>
            <strong>{order.vendorName || "Vendor"}</strong>
            <small>
              Got {formatMoney(order.receivedAmount)} / Left{" "}
              {formatMoney(calculatePending(order))}
            </small>
          </div>
          <span>Total {formatMoney(order.amount)}</span>
        </div>
      )}

      {isPaymentQueue ? (
        <div className="payment-panel">
          <div className="payment-note">
            <IndianRupee size={16} />
            Payment left
          </div>

          <div className="payment-methods" aria-label="Payment method">
            {PAYMENT_METHODS.map((method) => (
              <button
                className={order.paymentMethod === method ? "selected" : ""}
                key={method}
                type="button"
                onClick={() => onPaymentMethod && onPaymentMethod(order.id, method)}
              >
                {method}
              </button>
            ))}
          </div>

          <button
            className="paid-button"
            type="button"
            onClick={() => onPaid && onPaid(order.id, order.paymentMethod)}
          >
            <WalletCards size={18} />
            Mark Paid
          </button>
        </div>
      ) : isPaidQueue ? (
        <div className="payment-note paid-note">
          <CheckCircle2 size={16} />
          Paid by {order.paymentMethod || "Cash"}
        </div>
      ) : (
        <button
          className="given-button"
          type="button"
          onClick={() => onAction && onAction(order.id)}
        >
          {actionIcon}
          {actionLabel}
        </button>
      )}
      <button
        className="download-word-button"
        type="button"
        onClick={() => onDownload(order)}
      >
        <Download size={17} />
        Download Word
      </button>
    </article>
  );
}

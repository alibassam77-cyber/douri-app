var db = (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length)
    ? firebase.firestore()
    : null;
var auth = (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length)
    ? firebase.auth()
    : null;

var currentDoctorId = null;
var currentDoctorData = null;
var selectedClinicIndex = 0;
var unsubscribeBookingsAdmin = null;
var adminAddMap = null;
var adminAddMarker = null;
var adminLocationControlAdded = false;

function getTodayStrAdmin() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
}

function toggleTheme() {
    document.body.classList.toggle("dark-mode");
    var isDark = document.body.classList.contains("dark-mode");
    localStorage.setItem("douri_theme", isDark ? "dark" : "light");
}

function applySavedThemeAdmin() {
    if (localStorage.getItem("douri_theme") === "dark") {
        document.body.classList.add("dark-mode");
    } else {
        document.body.classList.remove("dark-mode");
    }
}

function logoutDoctor() {
    if (!auth) {
        window.location.href = "index.html";
        return;
    }
    auth.signOut().then(function() {
        window.location.href = "index.html";
    }).catch(function() {
        window.location.href = "index.html";
    });
}

function deleteBookingsByQuery(query) {
    return query.get().then(function(snapshot) {
        if (snapshot.empty) return Promise.resolve();
        var batch = db.batch();
        snapshot.forEach(function(doc) {
            batch.delete(doc.ref);
        });
        return batch.commit();
    });
}

function deleteClinicAndBookings(clinicIndex) {
    if (!currentDoctorId || !currentDoctorData) return;
    var clinics = Array.isArray(currentDoctorData.clinics) ? currentDoctorData.clinics.slice() : [];
    var targetClinic = clinics[clinicIndex];
    if (!targetClinic) return;

    var confirmMsg = "هل أنت متأكد من حذف العيادة (" + (targetClinic.clinicName || "") + ") وجميع مواعيدها المحجوزة؟";
    if (!confirm(confirmMsg)) return;

    var clinicBookingsQuery = db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", clinicIndex);

    deleteBookingsByQuery(clinicBookingsQuery).then(function() {
        clinics.splice(clinicIndex, 1);
        return db.collection("doctors").doc(currentDoctorId).update({ clinics: clinics });
    }).then(function() {
        currentDoctorData.clinics = clinics;
        if (clinics.length === 0) {
            var deleteAccountConfirm = confirm("لم يتبقَّ أي عيادة للطبيب. هل تريد حذف سجل الطبيب نهائياً من قائمة الأطباء أيضاً؟");
            if (deleteAccountConfirm) {
                return deleteDoctorPermanently();
            }
        }
        selectedClinicIndex = 0;
        renderAdminDoctorView();
        alert("تم حذف العيادة ومواعيدها بنجاح.");
    }).catch(function(err) {
        console.error(err);
        alert("حدث خطأ أثناء حذف العيادة.");
    });
}

function deleteDoctorPermanently() {
    if (!currentDoctorId) return Promise.resolve();
    var allDoctorBookingsQuery = db.collection("bookings")
        .where("doctorId", "==", currentDoctorId);

    return deleteBookingsByQuery(allDoctorBookingsQuery).then(function() {
        return db.collection("doctors").doc(currentDoctorId).delete();
    }).then(function() {
        if (unsubscribeBookingsAdmin) {
            unsubscribeBookingsAdmin();
            unsubscribeBookingsAdmin = null;
        }
        alert("تم حذف الطبيب وجميع مواعيده نهائياً.");
        window.location.href = "index.html";
    }).catch(function(err) {
        console.error(err);
        alert("حدث خطأ أثناء الحذف النهائي للطبيب.");
    });
}

function setAdminMapLocation(lat, lng, zoomLevel) {
    var latNum = parseFloat(lat);
    var lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return;

    var latInp = document.getElementById("newClinicLat");
    var lngInp = document.getElementById("newClinicLng");
    if (latInp) latInp.value = latNum.toFixed(6);
    if (lngInp) lngInp.value = lngNum.toFixed(6);

    initAdminAddMapIfNeeded();
    if (adminAddMap) {
        adminAddMap.setView([latNum, lngNum], zoomLevel || 15);
        if (adminAddMarker) {
            adminAddMarker.setLatLng([latNum, lngNum]);
        } else {
            adminAddMarker = L.marker([latNum, lngNum]).addTo(adminAddMap);
        }
        setTimeout(function() {
            if (adminAddMap) adminAddMap.invalidateSize();
        }, 150);
    }
}

function useCurrentLocationInAdmin() {
    if (!navigator.geolocation) {
        alert("المتصفح لا يدعم تحديد الموقع الجغرافي.");
        return;
    }
    navigator.geolocation.getCurrentPosition(function(pos) {
        setAdminMapLocation(pos.coords.latitude, pos.coords.longitude, 16);
    }, function() {
        alert("تعذر الوصول إلى موقعك الحالي.");
    }, {
        enableHighAccuracy: true,
        timeout: 10000
    });
}

function attachAdminMapLocationControl(mapInstance) {
    if (!mapInstance || adminLocationControlAdded || typeof L === "undefined") return;
    var LocationControl = L.Control.extend({
        options: { position: "topright" },
        onAdd: function() {
            var btn = L.DomUtil.create("button", "leaflet-bar leaflet-control");
            btn.type = "button";
            btn.title = typeof t === "function" ? t("my_location_btn") : "تحديد موقعي الحالي";
            btn.style.background = "#ffffff";
            btn.style.color = "#111827";
            btn.style.border = "1px solid rgba(0,0,0,0.2)";
            btn.style.borderRadius = "6px";
            btn.style.padding = "6px 10px";
            btn.style.fontWeight = "600";
            btn.style.fontSize = "12px";
            btn.style.cursor = "pointer";
            btn.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
            btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> ' + (typeof t === "function" ? t("my_location_btn") : "تحديد موقعي الحالي");

            L.DomEvent.disableClickPropagation(btn);
            L.DomEvent.on(btn, "click", function(e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                useCurrentLocationInAdmin();
            });
            return btn;
        }
    });
    mapInstance.addControl(new LocationControl());
    adminLocationControlAdded = true;
}

function initAdminAddMapIfNeeded() {
    var mapEl = document.getElementById("admin-add-map");
    if (!mapEl || typeof L === "undefined") return;
    if (!adminAddMap) {
        adminAddMap = L.map("admin-add-map").setView([15.3694, 44.1910], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap"
        }).addTo(adminAddMap);
        attachAdminMapLocationControl(adminAddMap);
        adminAddMap.on("click", function(e) {
            setAdminMapLocation(e.latlng.lat, e.latlng.lng, adminAddMap.getZoom());
        });
    }
    setTimeout(function() {
        if (adminAddMap) adminAddMap.invalidateSize();
    }, 200);
}

function addNewClinicFromAdmin() {
    if (!currentDoctorId || !currentDoctorData) return;
    var nameEl = document.getElementById("newClinicName");
    var cityEl = document.getElementById("newClinicCity");
    var streetEl = document.getElementById("newClinicStreet");
    var startEl = document.getElementById("newClinicStart");
    var endEl = document.getElementById("newClinicEnd");
    var serviceEl = document.getElementById("newClinicServiceTime");
    var latEl = document.getElementById("newClinicLat");
    var lngEl = document.getElementById("newClinicLng");

    var clinicName = nameEl ? nameEl.value.trim() : "";
    if (!clinicName) {
        alert("يرجى إدخال اسم العيادة الجديدة.");
        return;
    }

    var newClinic = {
        clinicName: clinicName,
        city: cityEl ? cityEl.value.trim() : "",
        street: streetEl ? streetEl.value.trim() : "",
        landmark: "",
        startTime: (startEl && startEl.value) ? startEl.value : "09:00",
        endTime: (endEl && endEl.value) ? endEl.value : "17:00",
        serviceTime: parseInt((serviceEl && serviceEl.value) || "10", 10) || 10,
        workingDays: [0, 1, 2, 3, 4, 6],
        lat: (latEl && latEl.value) ? parseFloat(latEl.value) : null,
        lng: (lngEl && lngEl.value) ? parseFloat(lngEl.value) : null,
        serialNumber: 0,
        dailyCounters: {},
        isClosed: false,
        isOnBreak: false
    };

    var clinics = Array.isArray(currentDoctorData.clinics) ? currentDoctorData.clinics.slice() : [];
    clinics.push(newClinic);

    db.collection("doctors").doc(currentDoctorId).update({ clinics: clinics }).then(function() {
        currentDoctorData.clinics = clinics;
        selectedClinicIndex = clinics.length - 1;
        if (nameEl) nameEl.value = "";
        renderAdminDoctorView();
        alert("تمت إضافة العيادة بنجاح.");
    }).catch(function(err) {
        console.error(err);
        alert("تعذر إضافة العيادة.");
    });
}

function toggleClinicClosedStatus(clinicIndex) {
    if (!currentDoctorId || !currentDoctorData) return;
    var clinics = Array.isArray(currentDoctorData.clinics) ? currentDoctorData.clinics.slice() : [];
    if (!clinics[clinicIndex]) return;
    clinics[clinicIndex].isClosed = !clinics[clinicIndex].isClosed;

    db.collection("doctors").doc(currentDoctorId).update({ clinics: clinics }).then(function() {
        currentDoctorData.clinics = clinics;
        renderAdminDoctorView();
    });
}

function callNextPatient(bookingId) {
    if (!bookingId || !db) return;
    db.collection("bookings").doc(bookingId).update({ status: "serving" });
}

function completePatient(bookingId) {
    if (!bookingId || !db) return;
    db.collection("bookings").doc(bookingId).update({ status: "done" });
}

function renderQueueForSelectedClinic() {
    var queueListEl = document.getElementById("adminQueueList");
    if (!queueListEl || !currentDoctorId || !db) return;

    if (unsubscribeBookingsAdmin) {
        unsubscribeBookingsAdmin();
        unsubscribeBookingsAdmin = null;
    }

    var todayStr = getTodayStrAdmin();
    unsubscribeBookingsAdmin = db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", selectedClinicIndex)
        .where("date", "==", todayStr)
        .onSnapshot(function(snapshot) {
            var items = [];
            snapshot.forEach(function(doc) {
                var d = doc.data();
                d.id = doc.id;
                if (d.status !== "cancelled") {
                    items.push(d);
                }
            });

            items.sort(function(a, b) {
                return (parseInt(a.ticketNumber, 10) || 0) - (parseInt(b.ticketNumber, 10) || 0);
            });

            if (items.length === 0) {
                queueListEl.innerHTML = '<p style="text-align:center;">' + (typeof t === "function" ? t("no_patients") : "لا يوجد مرضى في قائمة الانتظار لهذا اليوم.") + '</p>';
                return;
            }

            var html = "";
            items.forEach(function(p) {
                var statusText = p.status === "serving"
                    ? (typeof t === "function" ? t("status_serving") : "قيد الكشف الآن")
                    : (p.status === "done"
                        ? (typeof t === "function" ? t("booking_done") : "تم إنهاء الموعد")
                        : (typeof t === "function" ? t("status_waiting_admin") : "ينتظر"));

                html += '<div class="queue-item" style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:10px; border:1px solid #ddd; border-radius:8px; margin-bottom:8px;">' +
                    '<div>' +
                        '<strong>#' + (p.ticketNumber || "-") + ' — ' + (p.patientName || "") + '</strong>' +
                        '<div><small>' + statusText + (p.patientPhone ? " | " + p.patientPhone : "") + '</small></div>' +
                    '</div>' +
                    '<div style="display:flex; gap:6px;">' +
                        '<button type="button" class="btn-primary" onclick="callNextPatient(\'' + p.id + '\')">نداء</button>' +
                        '<button type="button" class="btn-outline" onclick="completePatient(\'' + p.id + '\')">إنهاء</button>' +
                    '</div>' +
                '</div>';
            });

            queueListEl.innerHTML = html;
        });
}

function renderAdminDoctorView() {
    if (!currentDoctorData) return;
    var nameEl = document.getElementById("adminDoctorName");
    var clinicsContainer = document.getElementById("adminClinicsList");
    if (nameEl) {
        nameEl.innerText = currentDoctorData.name || "";
    }

    var clinics = Array.isArray(currentDoctorData.clinics) ? currentDoctorData.clinics : [];
    if (selectedClinicIndex >= clinics.length) {
        selectedClinicIndex = 0;
    }

    if (clinicsContainer) {
        if (clinics.length === 0) {
            clinicsContainer.innerHTML = '<p>لا توجد عيادات مسجلة حالياً.</p>';
        } else {
            var html = "";
            clinics.forEach(function(c, idx) {
                var isSelected = idx === selectedClinicIndex;
                var closedLabel = c.isClosed
                    ? (typeof t === "function" ? t("open_clinic") : "فتح العيادة")
                    : (typeof t === "function" ? t("close_clinic") : "إغلاق العيادة");

                html += '<div class="clinic-card" style="margin-bottom:10px; border:' + (isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb') + ';">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">' +
                        '<div>' +
                            '<strong>' + (c.clinicName || ("عيادة " + (idx + 1))) + '</strong>' +
                            '<div><small>' + (c.city || "") + (c.street ? " - " + c.street : "") + '</small></div>' +
                        '</div>' +
                        '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
                            '<button type="button" class="btn-outline" onclick="selectedClinicIndex=' + idx + '; renderAdminDoctorView();">عرض الطابور</button>' +
                            '<button type="button" class="btn-outline" onclick="toggleClinicClosedStatus(' + idx + ')">' + closedLabel + '</button>' +
                            '<button type="button" class="btn-danger" onclick="deleteClinicAndBookings(' + idx + ')">حذف العيادة</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            });
            clinicsContainer.innerHTML = html;
        }
    }

    initAdminAddMapIfNeeded();
    renderQueueForSelectedClinic();
}

window.onload = function() {
    applySavedThemeAdmin();
    if (typeof applyLanguage === "function") {
        applyLanguage();
    }

    if (!auth || !db) return;

    auth.onAuthStateChanged(function(user) {
        if (!user) {
            window.location.href = "index.html";
            return;
        }
        currentDoctorId = user.uid;
        db.collection("doctors").doc(user.uid).get().then(function(docSnap) {
            if (!docSnap.exists) {
                window.location.href = "index.html";
                return;
            }
            currentDoctorData = docSnap.data();
            currentDoctorData.id = docSnap.id;
            renderAdminDoctorView();
        }).catch(function(err) {
            console.error(err);
        });
    });
};

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function isDoctorOwner(doctorId) {
      return isSignedIn() && request.auth.uid == doctorId;
    }

    match /doctors/{doctorId} {
      // قراءة بيانات العيادات متاحة لعرضها في صفحة البحث والحجز
      allow read: if true;

      // إنشاء أو تعديل أو حذف سجل الطبيب محصور بصاحب الحساب فقط
      allow create, update, delete: if isDoctorOwner(doctorId);
    }

    match /bookings/{bookingId} {
      // السماح بقراءة الحجوزات لمتابعة الطابور واستعادة الحجز بالرمز السري
      // (مع إمكانية تشديدها لاحقاً عبر Cloud Functions إذا أردت إخفاء أرقام الهواتف بالكامل)
      allow read: if true;

      // إنشاء حجز جديد يتطلب البيانات الأساسية وحالة انتظار أولية
      allow create: if request.resource.data.keys().hasAll([
          'doctorId',
          'clinicIndex',
          'patientName',
          'date',
          'ticketNumber',
          'status'
        ])
        && request.resource.data.patientName is string
        && request.resource.data.patientName.size() > 0
        && request.resource.data.date is string
        && request.resource.data.status == 'waiting';

      // السماح للطبيب صاحب العيادة بتعديل/حذف حجوزات عيادته،
      // أو السماح بتحديث حالة الحجز (مثل الإلغاء أو إعادة ترتيب الأرقام) ضمن قواعد المشروع
      allow update, delete: if isDoctorOwner(resource.data.doctorId)
        || (
          request.resource.data.doctorId == resource.data.doctorId
          && request.resource.data.clinicIndex == resource.data.clinicIndex
          && request.resource.data.date == resource.data.date
          && request.resource.data.status in ['waiting', 'serving', 'done', 'cancelled']
        );
    }
  }
}

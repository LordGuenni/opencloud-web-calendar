<script setup lang="ts">
import { ref, computed } from 'vue'
import { t } from '../composables/useLanguage'
import type { AddressBook, Contact, ContactFormData } from '../types/calendar'

const props = defineProps<{
  addressBooks: readonly AddressBook[]
  contacts: readonly Contact[]
  loading: boolean
}>()

const emit = defineEmits<{
  create: [data: ContactFormData]
  update: [contact: Contact, data: ContactFormData]
  delete: [contact: Contact]
  refresh: []
}>()

const searchQuery = ref('')
const editorOpen = ref(false)
const editingContact = ref<Contact | null>(null)

function createEmptyForm(): ContactFormData {
  return {
    addressBookHref: props.addressBooks[0]?.href || '',
    fullName: '',
    firstName: '',
    lastName: '',
    emails: [''],
    phones: [''],
    organization: '',
    title: '',
    birthday: '',
    notes: ''
  }
}

const form = ref<ContactFormData>(createEmptyForm())

const filteredContacts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.contacts
  return props.contacts.filter((c) => {
    const hay = [
      c.fullName,
      c.organization || '',
      c.title || '',
      ...c.emails,
      ...c.phones,
      c.notes || ''
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
})

function openCreate() {
  editingContact.value = null
  form.value = createEmptyForm()
  editorOpen.value = true
}

function openEdit(contact: Contact) {
  editingContact.value = contact
  form.value = {
    uid: contact.uid,
    addressBookHref: contact.addressBookHref,
    fullName: contact.fullName,
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    emails: contact.emails.length > 0 ? [...contact.emails] : [''],
    phones: contact.phones.length > 0 ? [...contact.phones] : [''],
    organization: contact.organization || '',
    title: contact.title || '',
    birthday: contact.birthday || '',
    notes: contact.notes || ''
  }
  editorOpen.value = true
}

function handleSave() {
  if (!form.value.fullName.trim() && !form.value.firstName.trim() && !form.value.lastName.trim()) {
    return
  }
  const payload: ContactFormData = {
    ...form.value,
    emails: form.value.emails.map((e) => e.trim()).filter(Boolean),
    phones: form.value.phones.map((p) => p.trim()).filter(Boolean)
  }
  if (editingContact.value) {
    emit('update', editingContact.value, payload)
  } else {
    emit('create', payload)
  }
  editorOpen.value = false
}

function handleDelete() {
  if (!editingContact.value) return
  emit('delete', editingContact.value)
  editorOpen.value = false
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
</script>

<template>
  <div class="ext:flex-1 ext:flex ext:flex-col ext:overflow-hidden ext:bg-white">
    <!-- Toolbar -->
    <div class="ext:px-4 sm:ext:px-6 ext:py-3 ext:border-b ext:border-gray-200 ext:flex ext:flex-wrap ext:items-center ext:justify-between ext:gap-3">
      <div>
        <button
          v-if="addressBooks.length > 0"
          type="button"
          class="ext:px-3 ext:py-1.5 ext:text-sm ext:font-medium ext:bg-blue-600 ext:text-white ext:rounded hover:ext:bg-blue-700"
          @click="openCreate"
        >
          + {{ t('New Contact') }}
        </button>
      </div>

      <div class="ext:flex ext:items-center ext:gap-2">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('Search contacts...')"
          class="ext:px-2.5 ext:py-1.5 ext:text-sm ext:border ext:border-gray-300 ext:rounded ext:w-56"
        />
        <button
          type="button"
          class="ext:p-1.5 ext:text-gray-600 hover:ext:bg-gray-100 ext:rounded"
          :title="t('Refresh')"
          @click="emit('refresh')"
        >
          <svg
            class="ext:w-4 ext:h-4"
            :class="{ 'ext:animate-spin': loading }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Contacts List -->
    <div class="ext:flex-1 ext:overflow-y-auto ext:p-4 sm:ext:p-6">
      <div
        v-if="addressBooks.length === 0 && !loading"
        class="ext:flex ext:flex-col ext:items-center ext:justify-center ext:h-56 ext:text-gray-500"
      >
        <p class="ext:text-sm">{{ t('No address books available') }}</p>
      </div>

      <div
        v-else-if="filteredContacts.length === 0"
        class="ext:flex ext:flex-col ext:items-center ext:justify-center ext:h-56 ext:text-gray-500"
      >
        <p class="ext:text-sm">{{ t('No contacts found') }}</p>
      </div>

      <div
        v-else
        class="ext:grid ext:grid-cols-1 md:ext:grid-cols-2 lg:ext:grid-cols-3 ext:gap-3 ext:max-w-6xl ext:mx-auto"
      >
        <div
          v-for="contact in filteredContacts"
          :key="`${contact.href}_${contact.uid}`"
          class="ext:p-4 ext:rounded-lg ext:border ext:border-gray-200 ext:bg-gray-50 hover:ext:bg-gray-100 ext:cursor-pointer ext:flex ext:items-start ext:gap-3 ext:transition-colors"
          @click="openEdit(contact)"
        >
          <div class="ext:w-10 ext:h-10 ext:rounded-full ext:bg-blue-100 ext:text-blue-700 ext:flex ext:items-center ext:justify-center ext:text-sm ext:font-bold ext:shrink-0">
            {{ getInitials(contact.fullName) }}
          </div>
          <div class="ext:flex-1 ext:min-w-0 ext:space-y-0.5">
            <div class="ext:text-sm ext:font-semibold ext:text-gray-900 ext:truncate">
              {{ contact.fullName }}
            </div>
            <div v-if="contact.organization || contact.title" class="ext:text-xs ext:text-gray-600 ext:truncate">
              {{ [contact.title, contact.organization].filter(Boolean).join(' • ') }}
            </div>
            <div v-if="contact.emails[0]" class="ext:text-xs ext:text-blue-600 ext:truncate">
              ✉ {{ contact.emails[0] }}
            </div>
            <div v-if="contact.phones[0]" class="ext:text-xs ext:text-gray-600 ext:truncate">
              ☎ {{ contact.phones[0] }}
            </div>
            <div v-if="contact.birthday" class="ext:text-xs ext:text-gray-500">
              🎂 {{ contact.birthday }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Contact Editor Modal -->
    <Teleport to="body">
      <div
        v-if="editorOpen"
        class="ext:fixed ext:inset-0 ext:z-50 ext:flex ext:items-center ext:justify-center ext:bg-black/50 ext:p-4"
        @click.self="editorOpen = false"
      >
        <div class="ext:bg-white ext:rounded-lg ext:shadow-xl ext:w-full ext:max-w-lg ext:max-h-[90vh] ext:flex ext:flex-col">
          <div class="ext:px-6 ext:py-4 ext:border-b ext:flex ext:items-center ext:justify-between">
            <h2 class="ext:text-lg ext:font-semibold ext:text-gray-900">
              {{ editingContact ? t('Edit Contact') : t('New Contact') }}
            </h2>
            <button type="button" class="ext:text-gray-500 hover:ext:text-gray-700" @click="editorOpen = false">
              <svg class="ext:w-5 ext:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form class="ext:px-6 ext:py-4 ext:space-y-3 ext:overflow-y-auto ext:flex-1" @submit.prevent="handleSave">
            <div v-if="!editingContact && addressBooks.length > 1">
              <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Address Book') }}</label>
              <select
                v-model="form.addressBookHref"
                class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
              >
                <option v-for="book in addressBooks" :key="book.href" :value="book.href">
                  {{ book.displayName }}
                </option>
              </select>
            </div>

            <div>
              <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Full Name') }}</label>
              <input
                v-model="form.fullName"
                type="text"
                required
                class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
              />
            </div>

            <div class="ext:grid ext:grid-cols-2 ext:gap-3">
              <div>
                <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('First Name') }}</label>
                <input
                  v-model="form.firstName"
                  type="text"
                  class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                />
              </div>
              <div>
                <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Last Name') }}</label>
                <input
                  v-model="form.lastName"
                  type="text"
                  class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                />
              </div>
            </div>

            <!-- Emails -->
            <div>
              <div class="ext:flex ext:items-center ext:justify-between ext:mb-1">
                <label class="ext:text-sm ext:font-medium ext:text-gray-700">{{ t('Email') }}</label>
                <button
                  type="button"
                  class="ext:text-xs ext:text-blue-600 hover:ext:underline"
                  @click="form.emails.push('')"
                >
                  + {{ t('Add email') }}
                </button>
              </div>
              <div class="ext:space-y-1.5">
                <div v-for="(_, idx) in form.emails" :key="idx" class="ext:flex ext:gap-2">
                  <input
                    v-model="form.emails[idx]"
                    type="email"
                    class="ext:flex-1 ext:px-3 ext:py-1.5 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                  />
                  <button
                    v-if="form.emails.length > 1"
                    type="button"
                    class="ext:px-2 ext:text-gray-400 hover:ext:text-red-600"
                    @click="form.emails.splice(idx, 1)"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>

            <!-- Phones -->
            <div>
              <div class="ext:flex ext:items-center ext:justify-between ext:mb-1">
                <label class="ext:text-sm ext:font-medium ext:text-gray-700">{{ t('Phone') }}</label>
                <button
                  type="button"
                  class="ext:text-xs ext:text-blue-600 hover:ext:underline"
                  @click="form.phones.push('')"
                >
                  + {{ t('Add phone') }}
                </button>
              </div>
              <div class="ext:space-y-1.5">
                <div v-for="(_, idx) in form.phones" :key="idx" class="ext:flex ext:gap-2">
                  <input
                    v-model="form.phones[idx]"
                    type="tel"
                    class="ext:flex-1 ext:px-3 ext:py-1.5 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                  />
                  <button
                    v-if="form.phones.length > 1"
                    type="button"
                    class="ext:px-2 ext:text-gray-400 hover:ext:text-red-600"
                    @click="form.phones.splice(idx, 1)"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>

            <div class="ext:grid ext:grid-cols-2 ext:gap-3">
              <div>
                <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Organization') }}</label>
                <input
                  v-model="form.organization"
                  type="text"
                  class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                />
              </div>
              <div>
                <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Job Title') }}</label>
                <input
                  v-model="form.title"
                  type="text"
                  class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                />
              </div>
            </div>

            <div>
              <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Birthday') }}</label>
              <input
                v-model="form.birthday"
                type="date"
                class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
              />
            </div>

            <div>
              <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Notes') }}</label>
              <textarea
                v-model="form.notes"
                rows="3"
                class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
              />
            </div>
          </form>

          <div class="ext:px-6 ext:py-4 ext:border-t ext:bg-gray-50 ext:flex ext:items-center ext:justify-between">
            <div>
              <button
                v-if="editingContact"
                type="button"
                class="ext:px-3 ext:py-2 ext:text-sm ext:text-red-600 hover:ext:text-red-800"
                @click="handleDelete"
              >
                {{ t('Delete') }}
              </button>
            </div>
            <div class="ext:flex ext:gap-2">
              <button
                type="button"
                class="ext:px-4 ext:py-2 ext:text-sm ext:text-gray-700 ext:bg-gray-200 ext:rounded hover:ext:bg-gray-300"
                @click="editorOpen = false"
              >
                {{ t('Cancel') }}
              </button>
              <button
                type="button"
                :disabled="!form.fullName.trim() && !form.firstName.trim() && !form.lastName.trim()"
                class="ext:px-4 ext:py-2 ext:text-sm ext:bg-blue-600 ext:text-white ext:rounded hover:ext:bg-blue-700 disabled:ext:opacity-50"
                @click="handleSave"
              >
                {{ t('Save') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

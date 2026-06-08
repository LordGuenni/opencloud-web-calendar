import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import EventDialog from '../../src/components/EventDialog.vue'
import { nextTick, ref } from 'vue'

const mockFormData = ref({ summary: '', calendarHref: '', start: new Date(), end: new Date(), allDay: false, description: '', location: '' })
const mockSaving = ref(false)

// Mock the composables
vi.mock('../../src/composables/useEventEditor', () => ({
  useEventEditor: () => ({
    isOpen: ref(true),
    isEditing: ref(false),
    editingEvent: ref(null),
    formData: mockFormData,
    saving: mockSaving,
    error: ref(null),
    conflictData: ref(null),
    editScope: ref(null),
    showScopeDialog: ref(false),
    close: vi.fn(),
    save: vi.fn(),
    deleteEvent: vi.fn(),
    selectEditScope: vi.fn(),
    cancelScopeDialog: vi.fn(),
    resolveConflictKeepLocal: vi.fn(),
    resolveConflictUseServer: vi.fn()
  })
}))

vi.mock('../../src/composables/useLanguage', () => ({
  t: (key: string) => key
}))

vi.mock('../../src/composables/useLocationSearch', () => ({
  useLocationSearch: () => ({
    results: ref([]),
    loading: ref(false),
    search: vi.fn(),
    clearResults: vi.fn()
  })
}))

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  mockFormData.value.summary = ''
  mockSaving.value = false
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('EventDialog.vue', () => {
  it('disables the save button when title is empty', async () => {
    mount(EventDialog, {
      props: { calendars: [] },
      attachTo: '#app'
    })
    
    await nextTick()
    
    const saveButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Save')) as HTMLButtonElement
    
    expect(saveButton).not.toBeUndefined()
    expect(saveButton.disabled).toBe(true)
  })

  it('disables the save button when title is only whitespace', async () => {
    mount(EventDialog, {
      props: { calendars: [] },
      attachTo: '#app'
    })
    
    await nextTick()
    
    const titleInput = document.querySelector('#event-title') as HTMLInputElement
    titleInput.value = '   '
    titleInput.dispatchEvent(new Event('input'))
    mockFormData.value.summary = '   '
    await nextTick()
    
    const saveButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Save')) as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)
  })

  it('enables the save button when title is provided', async () => {
    mount(EventDialog, {
      props: { calendars: [] },
      attachTo: '#app'
    })
    
    await nextTick()
    
    const titleInput = document.querySelector('#event-title') as HTMLInputElement
    titleInput.value = 'My Event'
    titleInput.dispatchEvent(new Event('input'))
    mockFormData.value.summary = 'My Event'
    await nextTick()
    
    const saveButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Save')) as HTMLButtonElement
    expect(saveButton.disabled).toBe(false)
  })
})

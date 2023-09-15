/**
 * A composable function containing logic related to download requests
 */

import { computed, getCurrentInstance, reactive, ref } from 'kolibri.lib.vueCompositionApi';
import { ContentRequestResource } from 'kolibri.resources';
import { createTranslator } from 'kolibri.utils.i18n';
import { get, set } from '@vueuse/core';
import redirectBrowser from 'kolibri.utils.redirectBrowser';
import urls from 'kolibri.urls';
import client from 'kolibri.client';
import Vue from 'kolibri.lib.vue';
import useDevices from './useDevices';

const downloadRequestsTranslator = createTranslator('DownloadRequests', {
  downloadStartedLabel: {
    message: 'Download requested',
    context: 'A message shown to indicate that a download request has been created',
  },
  goToDownloadsPage: {
    message: 'Go to downloads',
    context: 'A label for navigation to the download management page',
  },
  resourceRemoved: {
    message: 'Resource removed from my library',
    context: 'A message shown when a user has removed a resource from their library',
  },
});

// The reactive is defined in the outer scope so it can be used as a shared store
const downloadRequestMap = reactive({});
const loading = ref(true);
const availableSpace = ref(0);

export default function useDownloadRequests(store) {
  store = store || getCurrentInstance().proxy.$store;

  const { instanceId } = useDevices(store);

  function fetchUserDownloadRequests(params) {
    return ContentRequestResource.list(params)
      .then(downloadRequests => {
        for (const obj of downloadRequests) {
          set(downloadRequestMap, obj.id, obj);
        }
        set(loading, false);
      })
      .then(store.dispatch('notLoading'));
  }

  function fetchAvailableFreespace() {
    const loading = ref(true);
    const freespace = 0;
    client({
      url: `${urls['kolibri:core:freespace']()}`,
      params: { path: 'Content' },
    })
      .then(resp => {
        set(availableSpace, resp.data.freespace);
        set(loading, false);
      })
      .catch(() => -1);
    return freespace;
  }

  function navigateToDownloads() {
    redirectBrowser(urls['kolibri:kolibri.plugins.learn:my_downloads']());
  }

  function addDownloadRequest(content) {
    const metadata = {
      title: content.title,
      file_size: content.files.reduce((size, f) => size + f.file_size, 0),
      learning_activities: content.learning_activities,
    };
    const data = {
      contentnode_id: content.id,
      metadata,
      source_id: store.getters.currentUserId,
      source_instance_id: get(instanceId),
      reason: 'UserInitiated',
      facility: store.getters.currentFacilityId,
      status: 'Pending',
      date_added: new Date(),
    };
    ContentRequestResource.create(data).then(downloadRequest => {
      set(downloadRequestMap, downloadRequest.node_id, downloadRequest);
    });

    store.commit('CORE_CREATE_SNACKBAR', {
      text: downloadRequestsTranslator.$tr('downloadStartedLabel'),
      actionText: downloadRequestsTranslator.$tr('goToDownloadsPage'),
      actionCallback: navigateToDownloads,
      backdrop: false,
      forceReuse: true,
      autoDismiss: true,
    });
    return Promise.resolve();
  }

  function removeDownloadRequest(content) {
    ContentRequestResource.deleteModel({
      id: content.id,
      contentnode_id: content.contentnode_id,
    });
    Vue.delete(downloadRequestMap, content.id);
    return Promise.resolve();
  }

  function sortedFilteredDownloads() {
    const query = computed(() => get(route).query);
    const route = computed(() => store.state.route);
    const sort = computed(() => query.value.sort);
    const activityType = computed(() => query.value.activity || 'all');
    let downloadsToDisplay = [];
    if (downloadRequestMap) {
      for (const [, value] of Object.entries(downloadRequestMap)) {
        downloadsToDisplay.push(value);
      }
      if (activityType) {
        if (activityType.value !== 'all') {
          downloadsToDisplay = downloadsToDisplay.filter(download =>
            download.metadata.learning_activities.includes(activityType.value)
          );
        }
      }
      if (sort) {
        switch (sort.value) {
          case 'newest':
            downloadsToDisplay.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
            break;
          case 'oldest':
            downloadsToDisplay.sort((a, b) => new Date(a.requested_at) - new Date(b.requested_at));
            break;
          case 'smallest':
            downloadsToDisplay.sort((a, b) => a.metadata.file_size - b.metadata.file_size);
            break;
          case 'largest':
            downloadsToDisplay.sort((a, b) => b.metadata.file_size - a.metadata.file_size);
            break;
          default:
            // If no valid sort option provided, return unsorted array
            break;
        }
      }
    }
  }

  function isDownloadingByLearner(content) {
    if (!content || !content.id) {
      return false;
    }
    const downloadRequest = downloadRequestMap[content.id];
    return Boolean(downloadRequest && !downloadRequest.status === 'COMPLETED');
  }

  function isDownloadedByLearner(content) {
    if (!content || !content.id) {
      return false;
    }
    const downloadRequest = downloadRequestMap[content.id];
    return Boolean(downloadRequest && downloadRequest.status === 'COMPLETED');
  }

  const downloads = computed(() => this.sortedFilteredDownloads());

  return {
    fetchUserDownloadRequests,
    fetchAvailableFreespace,
    availableSpace,
    downloadRequestMap,
    addDownloadRequest,
    loading,
    downloads,
    sortedFilteredDownloads,
    removeDownloadRequest,
    downloadRequestsTranslator,
    isDownloadingByLearner,
    isDownloadedByLearner,
  };
}

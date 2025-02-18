<template>

  <ImmersivePage
    :appBarTitle="learnString('exploreLibraries')"
    :route="back"
    :primary="false"
    :loading="loading"
  >
    <div
      class="page-header"
      data-test="page-header"
      :style="pageHeaderStyle"
    >
      <h1>
        {{ $tr('allLibraries') }}
      </h1>
      <p>
        {{ $tr('showingLibraries') }}
      </p>
    </div>
    <div v-if="loading">
      <KCircularLoader />
    </div>
    <div v-else>
      <LibraryItem
        v-for="device in pinnedDevices"
        :key="device['instance_id']"
        :deviceId="device['instance_id']"
        :deviceName="device['device_name']"
        :deviceIcon="getDeviceIcon(device)"
        :channels="deviceChannelsMap[device['instance_id']]"
        :totalChannels="device['total_count']"
        :pinIcon="getPinIcon(true)"
        :showDescription="device['instance_id'] === studioId"
        :disablePinDevice="device['instance_id'] === studioId"
        @togglePin="handlePinToggle"
      />
      <div v-if="areMoreDevicesAvailable">
        <div
          v-if="pinnedDevicesExist"
          data-test="more-libraries"
        >
          <h2>{{ learnString('moreLibraries') }}</h2>
          <KButton
            v-if="displayShowButton"
            data-test="show-button"
            :text="coreString('showAction')"
            :primary="false"
            @click="loadMoreDevices"
          />
        </div>
        <LibraryItem
          v-for="(device, index) in unpinnedDevices.slice(0, moreDevices)"
          :key="index"
          :deviceId="device['instance_id']"
          :deviceName="device['device_name']"
          :deviceIcon="getDeviceIcon(device)"
          :channels="deviceChannelsMap[device['instance_id']]"
          :totalChannels="device['total_count']"
          :pinIcon="getPinIcon(false)"
          @togglePin="handlePinToggle"
        />
        <KButton
          v-if="displayShowMoreButton"
          data-test="show-more-button"
          :text="coreString('showMoreAction')"
          :primary="false"
          @click="loadMoreDevices"
        />
      </div>
    </div>
  </ImmersivePage>

</template>


<script>

  import ImmersivePage from 'kolibri.coreVue.components.ImmersivePage';
  import commonCoreStrings from 'kolibri.coreVue.mixins.commonCoreStrings';
  import { crossComponentTranslator, localeCompare } from 'kolibri.utils.i18n';
  import { ref, reactive, watch, set } from 'kolibri.lib.vueCompositionApi';
  import commonLearnStrings from '../commonLearnStrings';
  import useChannels from '../../composables/useChannels';
  import useContentLink from '../../composables/useContentLink';
  import useDevices from '../../composables/useDevices';
  import usePinnedDevices from '../../composables/usePinnedDevices';
  import { KolibriStudioId } from '../../constants';
  import LibraryItem from './LibraryItem';

  const PinStrings = crossComponentTranslator(LibraryItem);

  export default {
    name: 'ExploreLibrariesPage',
    components: {
      ImmersivePage,
      LibraryItem,
    },
    mixins: [commonCoreStrings, commonLearnStrings],
    setup() {
      const { networkDevices } = useDevices();
      const { fetchChannels } = useChannels();
      const { createPinForUser, deletePinForUser, fetchPinsForUser } = usePinnedDevices();
      const { back } = useContentLink();
      const deviceChannelsMap = reactive({});
      const loading = ref(true);

      function _updateDeviceChannels(device, channels) {
        set(deviceChannelsMap, device.instance_id, channels);
      }

      function loadDeviceChannels() {
        let currentDevice;
        Object.keys(networkDevices.value).forEach(key => {
          const promises = [];
          currentDevice = networkDevices.value[key];
          if (!deviceChannelsMap[currentDevice.instance_id]) {
            const baseurl = currentDevice.base_url;
            const promise = fetchChannels({ baseurl }).then(channels => {
              _updateDeviceChannels(currentDevice, channels);
              loading.value = false;
            });
            promises.push(promise);
          }
          Promise.all(promises).then(() => {
            // In case we don't successfully fetch any channels, don't do a perpetual loading state.
            loading.value = false;
          });
        });
      }
      loadDeviceChannels();
      watch(networkDevices, loadDeviceChannels);

      return {
        deletePinForUser,
        createPinForUser,
        fetchPinsForUser,
        deviceChannelsMap,
        fetchChannels,
        networkDevices,
        back,
      };
    },
    data() {
      return {
        loading: false,
        moreDevices: 0,
        usersPins: [],
      };
    },
    computed: {
      areMoreDevicesAvailable() {
        return this.unpinnedDevices?.length > 0;
      },
      displayShowButton() {
        return this.moreDevices === 0 && this.areMoreDevicesAvailable;
      },
      displayShowMoreButton() {
        return this.moreDevices < this.unpinnedDevices?.length;
      },
      networkDevicesWithChannels() {
        return Object.values(this.networkDevices)
          .filter(device => this.deviceChannelsMap[device.instance_id]?.length > 0)
          .sort((a, b) => {
            if (a.instance_id === this.studioId) {
              return 1;
            }
            if (b.instance_id === this.studioId) {
              return -1;
            }
            return localeCompare(a.device_name, b.device_name);
          });
      },
      pageHeaderStyle() {
        return {
          backgroundColor: this.$themeTokens.surface,
          color: this.$themeTokens.text,
        };
      },
      studioId() {
        return KolibriStudioId;
      },
      usersPinsDeviceIds() {
        // The IDs of devices (mapped to instance_id on the networkDevicesWithChannels
        // items) -- which the user has pinned
        return this.usersPins.map(pin => pin.instance_id);
      },
      pinnedDevices() {
        return this.networkDevicesWithChannels.filter(device => {
          return (
            this.usersPinsDeviceIds.includes(device.instance_id) ||
            device.instance_id === this.studioId
          );
        });
      },
      pinnedDevicesExist() {
        return this.pinnedDevices.length > 0;
      },
      unpinnedDevices() {
        return this.networkDevicesWithChannels.filter(device => {
          return (
            !this.usersPinsDeviceIds.includes(device.instance_id) &&
            device.instance_id !== this.studioId
          );
        });
      },
    },
    watch: {
      pinnedDevicesExist: {
        handler(newValue) {
          if (!newValue) {
            this.loadMoreDevices();
          }
        },
        deep: true,
        immediate: false,
      },
    },
    methods: {
      createPin(instance_id) {
        return this.createPinForUser(instance_id).then(response => {
          const id = response.id;
          this.usersPins = [...this.usersPins, { instance_id, id }];
          this.moreDevices = 0;
          // eslint-disable-next-line
          this.$store.dispatch('createSnackbar', PinStrings.$tr('pinnedTo'));
        });
      },
      deletePin(instance_id, pinId) {
        return this.deletePinForUser(pinId).then(() => {
          // Remove this pin from the usersPins
          this.usersPins = this.usersPins.filter(pin => pin.instance_id != instance_id);
          if (this.usersPins.length === 0) {
            this.loadMoreDevices();
          }
          // eslint-disable-next-line
          this.$store.dispatch('createSnackbar', PinStrings.$tr('pinRemoved'));
        });
      },
      handlePinToggle(instance_id) {
        if (this.usersPinsDeviceIds.includes(instance_id)) {
          const pinId = this.usersPins.find(pin => pin.instance_id === instance_id);
          this.deletePin(instance_id, pinId);
        } else {
          this.createPin(instance_id);
        }
      },
      getDeviceIcon(device) {
        if (device['operating_system'] === 'Android') {
          return 'device';
        } else if (!device['subset_of_users_device']) {
          return 'cloud';
        } else {
          return 'laptop';
        }
      },
      getPinIcon(pinned) {
        return pinned ? 'pinned' : 'notPinned';
      },
      loadMoreDevices() {
        this.moreDevices += 4;
      },
    },
    $trs: {
      allLibraries: {
        message: 'All libraries',
        context: 'A header for Explore Libraries page',
      },
      showingLibraries: {
        message: 'Showing libraries on other devices around you',
        continue: 'Description of the kind of devices displayed',
      },
      // The strings below are not used currently used in the code.
      // This is to aid the translation of the string
      /* eslint-disable kolibri/vue-no-unused-translations */
      allResources: {
        message: 'All resources',
        context: 'A filter option to show all resources',
      },
      myDownloadsOnly: {
        message: 'My downloads only',
        context: 'A filter option to show only downloaded resources',
      },
      skip: {
        message: 'Skip',
        context: 'An action to filter only downloaded resources',
      },
      useDownloadedResourcesFilter: {
        message: 'Use this filter to only see resources you have downloaded from this library.',
        context: 'A dialog message displayed when filtering only downloaded resources',
      },
      /* eslint-enable kolibri/vue-no-unused-translations */
    },
  };

</script>


<style lang="scss" scoped>

  @import '~kolibri-design-system/lib/styles/definitions';

  .page-header {
    @extend %dropshadow-1dp;

    width: calc(100% + 60px);
    padding: 70px 30px 20px;
    margin-top: -50px;
    margin-bottom: 50px;
    margin-left: -30px;

    &:focus {
      outline-width: 4px;
      outline-offset: 6px;
    }
  }

</style>

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ViewsService } from './views.service';
import { Acp, AcpAccessConfig, AcpFile, AppSettings } from '../database/entities';

describe('ViewsService', () => {
  let service: ViewsService;
  let acpRepository: { findOne: jest.Mock };
  let accessConfigRepository: { findOne: jest.Mock };
  let fileRepository: { find: jest.Mock };
  let settingsRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    acpRepository = { findOne: jest.fn() };
    accessConfigRepository = { findOne: jest.fn() };
    fileRepository = { find: jest.fn() };
    settingsRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViewsService,
        { provide: getRepositoryToken(Acp), useValue: acpRepository },
        { provide: getRepositoryToken(AcpAccessConfig), useValue: accessConfigRepository },
        { provide: getRepositoryToken(AcpFile), useValue: fileRepository },
        { provide: getRepositoryToken(AppSettings), useValue: settingsRepository },
      ],
    }).compile();

    service = module.get<ViewsService>(ViewsService);
  });

  it('uses bookletModule IDs as sequence IDs on ACP start page', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      name: 'ACP',
      description: 'Demo',
      acpIndex: {
        assessmentParts: [
          {
            units: [{ id: 'unit-1', name: 'Unit 1' }],
            bookletModules: [
              {
                id: 'mod-1',
                name: [{ lang: 'de', value: 'Modul 1' }],
                units: [{ id: 'unit-1', order: 1 }],
              },
            ],
            instruments: [
              {
                id: 'inst-1',
                name: 'Instrument 1',
                testcenterBooklet: [
                  {
                    definitionId: 'booklet-1.xml',
                    modules: [{ moduleId: 'mod-1' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    accessConfigRepository.findOne.mockResolvedValue({ featureConfig: {} });

    const start = await service.getAcpStartPage('acp-1');
    expect(start.sequences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'mod-1',
          bookletDefinitionId: 'booklet-1.xml',
          instrumentName: 'Instrument 1',
        }),
      ]),
    );
  });

  it('supports different module reference formats and deduplicates sequence IDs', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      name: 'ACP',
      description: 'Demo',
      acpIndex: {
        assessmentParts: [
          {
            units: [{ id: 'unit-1', name: 'Unit 1' }],
            bookletModules: [
              {
                id: 'mod-1',
                name: 'Module 1',
                units: [{ id: 'unit-1', order: 1 }],
              },
              {
                id: 'mod-2',
                name: 'Module 2',
                units: [{ id: 'unit-1', order: 1 }],
              },
            ],
            instruments: [
              {
                id: 'inst-1',
                name: 'Instrument 1',
                testcenterBooklet: [
                  {
                    definitionId: 'booklet-1.xml',
                    modules: [{ moduleId: 'mod-1' }, { id: 'mod-2' }, 'mod-1'],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    accessConfigRepository.findOne.mockResolvedValue({ featureConfig: {} });

    const start = await service.getAcpStartPage('acp-1');
    const sequenceIds = (start.sequences || []).map((s: { id: string }) => s.id);

    expect(sequenceIds.filter((id: string) => id === 'mod-1')).toHaveLength(1);
    expect(sequenceIds).toEqual(expect.arrayContaining(['mod-1', 'mod-2']));
  });

  it('exposes canonical metadataColumns when legacy key is stored', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      name: 'ACP',
      description: 'Demo',
      acpIndex: {
        assessmentParts: [],
      },
    });
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        itemListMetadataColumns: ['metaA', 'metaB'],
      },
    });

    const start = await service.getAcpStartPage('acp-1');
    expect(start.featureConfig).toMatchObject({
      metadataColumns: {
        visible: ['metaA', 'metaB'],
        order: ['metaA', 'metaB'],
      },
    });
    expect(start.featureConfig.itemListMetadataColumns).toBeUndefined();
  });
});
